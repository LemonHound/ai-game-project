# About Page

**Status: needs implementation**

## Background

A stub `/about` page and route already exist (`AboutPage.tsx`, registered in `App.tsx`). This spec
replaces the stub with a full page that showcases the project, surfaces live platform stats, and
provides donation links for supporters.

The page should feel personal and alive — not a marketing brochure. Stats give visitors a sense of
real activity; donation links are present but unobtrusive.

## Page Sections

### 1. Project intro

A short paragraph about what AI Game Hub is and why it exists. Tone: enthusiastic, direct, no
corporate fluff. Reference the adaptive AI angle and the fact it is a passion project.

### 2. Platform stats

A stats row/grid showing live and placeholder figures. Stats with a `*` are fetched from the DB;
the rest are rendered as animated counters with fixed or randomly-seeded starting values (see below).

| Stat | Label | Source |
|------|-------|--------|
| Total games played | "Games Played" | DB — COUNT across all game tables |
| Total moves recorded | "Moves Analyzed" | DB — SUM of `array_length(move_list, 1)` across all tables |
| Unique players | "Players" | DB — COUNT DISTINCT `user_id` across all tables |
| AI win rate | "AI Win Rate" | DB — `ai_win` outcomes / completed games (outcome not null, not 'draw') |
| Training data collected | "Training Moves" | Same value as "Moves Analyzed", framed differently — real data |
| Days since launch | "Days Running" | Computed from hardcoded launch date (2025-01-01 placeholder; update at deploy) |

**Placeholder stats** (not yet captured in DB; displayed with fun framing until real data exists):

| Stat | Label | Value |
|------|-------|-------|
| "AI iterations" | "AI Iterations" | Random integer 1,000–9,999, seeded on page load |
| "Bugs squashed" | "Bugs Squashed" | Random integer 50–500, seeded on page load |

Placeholder stats should be visually identical to real ones. No asterisks, no disclaimers — this is
flavor, not a financial report. When real tracking exists, swap in the real value.

All stats render with a count-up animation on page load (0 → final value over ~1s).

### 3. Donation links

Two donation buttons, side by side, low visual weight (secondary button style — not a hero CTA).
Platform links are stubs at implementation time; the user will fill in real URLs before launch.

| Platform | Label | URL (stub) |
|----------|-------|------------|
| Buy Me a Coffee | "Buy us a coffee" | `https://buymeacoffee.com/` (stub) |
| Patreon | "Support on Patreon" | `https://patreon.com/` (stub) |

These should open in a new tab. Add a one-line note above the buttons, e.g.:
> "If you're enjoying the games, contributions help keep the servers running."

No hard sell. The section should be easy to miss if you're not looking for it.

### 4. Meet the Team

Two team member cards displayed side by side (1-col on mobile, 2-col on desktop). Each card shows:

| Field | Description |
|-------|-------------|
| Photo | Circular avatar image (placeholder URL until real photos are provided) |
| Name | Team member's name (bold) |
| Role | Title / role on the project (subtle text) |
| Bio | 1–2 sentence personal bio |
| Links | Icon links to GitHub and LinkedIn profiles (`target="_blank"`) |

Team data is defined as a `TEAM_MEMBERS` constant array in `AboutPage.tsx` with placeholder values
for two members. Update with real data before launch.

Use DaisyUI `card` and `avatar` components. Keep the section warm and personal — this is a passion
project, not a corporate team page.

### 5. Tech stack callout (optional, low priority)

A small "built with" section listing the major technologies (FastAPI, React, PostgreSQL, GCP). Can
be a simple icon row or a brief bullet list. Implement only if it fits the layout without adding
visual clutter; skip if it feels forced.

## Backend

New endpoint: `GET /api/about/stats`

- No auth required — public endpoint.
- Returns the DB-backed stats (games played, moves analyzed, unique players, AI win rate, training
  moves). Does not return placeholder stats; those are generated client-side.
- Response should be cached for a short TTL (e.g., 60 seconds) to avoid a DB hit on every page
  load. Use a module-level dict with a timestamp guard (not `functools.lru_cache`, which is
  incompatible with async route handlers). No Redis needed.
- Register the router in `app.py` as `/api/about`.

Response shape:
```json
{
  "games_played": 142,
  "moves_analyzed": 4821,
  "unique_players": 38,
  "ai_win_rate": 0.61,
  "training_moves": 4821,
  "days_running": 89
}
```

## Frontend

Replace the contents of `src/frontend/src/pages/AboutPage.tsx` entirely. Keep the file and component
name; do not move the route.

- Use TanStack Query to fetch `/api/about/stats` — `useQuery` with a `staleTime` of 60s to match
  the server-side TTL.
- Count-up animation: a simple custom hook `useCountUp(target, duration)` that interpolates from 0
  to `target` over `duration` ms using `requestAnimationFrame`. No external animation library.
- Donation links: plain `<a href="..." target="_blank" rel="noopener noreferrer">` wrapped in
  DaisyUI `btn btn-outline` or equivalent secondary button style.
- Stats layout: a responsive grid (2 columns mobile, 3–4 columns desktop) using Tailwind. Each
  stat is a card with a large number and a small label.

## Configuration

Donation URLs should be defined as constants at the top of `AboutPage.tsx` so they are easy to
update in one place:

```typescript
const DONATE_URLS = {
  buyMeACoffee: 'https://buymeacoffee.com/',
  patreon: 'https://patreon.com/',
};
```

Launch date for "days running" should be a constant in the backend about router:
```python
LAUNCH_DATE = date(2025, 1, 1)  # update before go-live
```

## Test Cases

| Tier | Name | What it checks |
|------|------|----------------|
| API integration | `GET /api/about/stats returns 200` | Endpoint returns all required fields with correct types; no auth needed |
| API integration | `stats values are non-negative` | All numeric fields ≥ 0; ai_win_rate between 0 and 1 |
| Unit | `useCountUp animates from 0 to target` | Hook returns 0 at start and target value after duration |
| E2E | About page loads and displays stats | Stats grid renders with non-zero values; donation links are present |
| E2E | About page shows team section | Two team member cards render with names, roles, and profile links |
| Manual | Donation links open correctly | Both links open in a new tab to the correct platform |
| Manual | Count-up animation plays on load | Numbers animate on first render; no jank on typical hardware |
| Manual | Donation URLs updated before launch | `DONATE_URLS` constants point to real accounts before public launch |
