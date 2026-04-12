# Site Presence Spec

**Status: ready**

## Goal

Make the site feel like a real product with a human story behind it. Users should be able to learn who built
this, why it exists, and have a frictionless way to support the project financially.

## Scope

- About page: real team content, project intro, live platform stats, donation CTAs
- Footer: links to About, Support, and Discord (placeholder)
- Stats expansion: 4x2 grid replacing the current 4x2 with 2 new computed stats and removal of the
  redundant `training_moves` field

## Tone

Personal and casual. Someone professional looking at this site should see personality, creativity, and joy
immediately. No corporate copy.

## Team

### Kevin Zookski
- **Role:** Architect & Engineer
- **Bio:** Kevin has held roles across every layer of the stack over his career — product, design, frontend,
  backend, and database. He designed and built AI Game Hub from the ground up.
- **Photo:** Initials avatar (consistent with PlayerCard style elsewhere on the site). Kevin may provide a
  real photo later.
- **Social links:** None at this time.

### Brian Waskevich
- **Role:** ML & Data
- **Bio:** Brian has taken sole ownership of the ML models, training pipeline, and the database schema
  designed to let the AI adapt quickly to different playstyles.
- **Photo:** Initials avatar. Brian may provide a real photo and updated bio later.
- **Social links:** TBD — Brian to provide.
- **Implementation note:** Bio and social links are defined as constants at the top of `AboutPage.tsx`
  with a `// TODO: Brian to update` comment so they can be updated with a single-line change.

## Platform Stats (4x2 grid)

`training_moves` is removed — it was identical to `moves_analyzed` and misleading. Two new stats replace
the removed one and the two placeholder cards ("AI Iterations", "Bugs Squashed"), bringing the total to 8.

### All 8 stats in display order

| Stat | Label | Source |
|------|-------|--------|
| `games_played` | Games Played | Existing — COUNT of ended games across all game tables |
| `moves_analyzed` | Moves Analyzed | Existing — SUM of move_list lengths across ended games |
| `registered_players` | Registered Players | New — `COUNT(*) FROM users WHERE is_active = true` |
| `unique_players` | Active Players | Existing — COUNT of distinct user_ids across all game tables |
| `ai_win_rate` | AI Win Rate | Existing — ai_won / decided games |
| `player_win_rate` | Player Win Rate | New — player_won / decided games |
| `avg_moves_per_game` | Avg. Moves/Game | New — AVG(array_length(move_list, 1)) across ended games, 1 decimal |
| `days_running` | Days Running | Existing — days since LAUNCH_DATE |

Grid layout: `grid-cols-2 md:grid-cols-4` (2 columns on mobile, 4 on desktop).

### Backend changes (`src/backend/about.py`)

Expand `_query_stats()`:
- Add `registered_players`: single query `SELECT COUNT(*) FROM users WHERE is_active = true`
- Accumulate `player_wins` in the per-game loop (already have `player_won` filter available)
- Accumulate `total_ended` for avg computation (same as existing `games_played`)
- Derive `player_win_rate = round(player_wins / decided_games, 3) if decided_games > 0 else 0.0`
- Derive `avg_moves_per_game = round(moves_analyzed / games_played, 1) if games_played > 0 else 0.0`
- Add `monthly_cost_usd = int(os.getenv("MONTHLY_COST_ESTIMATE", "20"))`
- Remove `training_moves` from the return dict

### Frontend changes

`AboutPlatformStats.tsx`: remove `trainingMoves` prop, add `registeredPlayers`, `playerWinRate`,
`avgMovesPerGame`. Render all 8 stats in `grid-cols-2 md:grid-cols-4`.

`AboutPage.tsx`: update the `AboutPlatformStats` call site to pass the new props.

`api/about.ts`: add `registered_players`, `player_win_rate`, `avg_moves_per_game`, `monthly_cost_usd`
to the `AboutStats` interface; remove `training_moves`.

## Donation / Support

Two CTAs, equal weight. Both open externally (`target="_blank" rel="noopener noreferrer"`).

| Platform | URL |
|----------|-----|
| Buy Me a Coffee | `https://buymeacoffee.com/aigamehub` |
| Patreon | `https://www.patreon.com/cw/AIGameHub` |

### Cost transparency

A single line rendered near the donation buttons:

> "Hosting and AI model costs run ~$X/month. Contributions of any size help keep the games running."

`$X` is `monthly_cost_usd` from the stats API response. If the stats query fails or is loading, the line
is omitted rather than showing a broken value.

### CTA placement

- **About page:** Full section — cost transparency line above both buttons.
- **Footer:** Single "Support the project" link to `https://buymeacoffee.com/aigamehub`. No cost line.

## Footer

Replace the current bare copyright line with:

```
© {year} AI Game Hub  ·  About  ·  Support  ·  Discord (coming soon)
```

- **About** — `<Link to="/about">` (React Router)
- **Support** — external link to `https://buymeacoffee.com/aigamehub`
- **Discord** — visually dimmed, `cursor-not-allowed`, no `href`, title attribute "Coming soon"

Copyright year uses `new Date().getFullYear()`.

## What is NOT in this spec

- GitHub repo link in footer (intentional — don't drive traffic there yet)
- Origin story section (the intro paragraph is sufficient)
- Contact form or email link (deferred)
- Goal/progress meter for donations (deferred)
- Live GCP billing API integration (deferred — use `MONTHLY_COST_ESTIMATE` env var for now)
- Real photos for team members (deferred — Kevin and Brian to provide separately)
- Kevin or Brian social links (Kevin: none at this time; Brian: TBD)

## Test Cases

| Tier | Scenario | Test name |
|------|----------|-----------|
| Unit (Vitest) | About page renders Kevin and Brian's names | `renders_team_member_names` |
| Unit (Vitest) | About page renders all 8 stat card labels | `renders_eight_stat_cards` |
| Unit (Vitest) | About page renders both donation buttons with correct hrefs | `renders_donation_buttons` |
| Unit (Vitest) | About page renders cost transparency line from stats data | `renders_cost_line` |
| Unit (Vitest) | Footer renders About link, Support link, Discord placeholder | `footer_renders_all_links` |
| API integration | `GET /api/about/stats` returns all required fields incl. new ones | `test_about_stats_returns_all_fields` |
| API integration | `GET /api/about/stats` `monthly_cost_usd` matches `MONTHLY_COST_ESTIMATE` env var | `test_about_stats_monthly_cost` |
| E2E | About page loads with stat values visible (not in loading state) | `about_page_stats_load` |
| E2E | Both donation buttons visible with correct hrefs | `about_page_donation_buttons` |
