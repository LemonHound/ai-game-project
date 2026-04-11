# Home Landing and Navigation

**Status: implemented**

## Goal

The home page should orient new and returning users immediately: active games, live platform statistics, and clear paths
to the catalog (`/games`), public rankings (`/stats`), about, and account areas. DB-backed sections use skeleton
placeholders until data arrives.

## Scope

- Home (`/`): hero, active games grid (from `GET /api/games_list?category=active`), platform stats (from
  `GET /api/about/stats`), and a compact site map with links.
- Games catalog (`/games`): detailed cards via shared `GameSummaryCard`; cross-links to home and stats.
- Public rankings: primary route `/stats` (nav label **Stats**); legacy `/leaderboard` redirects to `/stats`.
- Footer: include Stats alongside Home, Games, About.
- Loading UX: shimmer-style skeletons for games grids, stats grids, stats table, profile auth loading, games list fetch,
  and per-game `GameStatsPanel` while `/api/stats/me` loads (not spinner-only for these surfaces).

## Game metadata (database)

The `games` table exposes explicit columns instead of overloading `tags`:

| Column                | Type    | Meaning                                                             |
| --------------------- | ------- | ------------------------------------------------------------------- |
| `game_shell_ready`    | BOOLEAN | Client route and game loop are wired (false e.g. for Pong stub).    |
| `ai_model_integrated` | BOOLEAN | Adaptive / trained model is connected (true for Tic Tac Toe today). |

`GET /api/games_list` and `GET /api/game/{id}/info` include these fields. Free-form `tags` remains for display labels
(Strategy, Quick Play, etc.).

### UI rules

- `game_shell_ready === false`: show **Not available yet** (neutral outline). Difficulty is not shown as meaningful AI
  difficulty.
- `game_shell_ready && !ai_model_integrated`: show **No trained AI yet** (warning outline) and **AI Difficulty: …** with
  tooltip that the value is a placeholder until a model ships.
- `ai_model_integrated`: show **AI Difficulty: …** only.

## Out of scope

- Multiplayer or PvP.
- Vote-based moves (possible future; not part of this spec).

## Test Cases

| Tier            | Name                                                         | What it checks                                             |
| --------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| Unit            | `HomePage shows primary navigation links`                    | Hero links include `/games` and `/stats`.                  |
| Unit            | `StatsPage renders rankings heading`                         | H1 reads Stats; table loads from MSW.                      |
| Unit            | `Navbar includes Stats link`                                 | Visible link text targets `/stats`.                        |
| Unit            | `games api returns game_shell_ready and ai_model_integrated` | MSW games include new fields.                              |
| Unit            | `GameInfo pydantic includes shell and AI flags`              | `tests/unit/test_models.py` constructs valid `GameInfo`.   |
| Unit            | `GameSummaryCard reflects shell and AI flags`                | Warning vs neutral badges from `GameSummaryCard.test.tsx`. |
| API integration | (existing) `GET /api/games_list`                             | Response games include boolean flags after migration.      |
| E2E             | `smoke homepage shows All games and Public stats links`      | `tests/smoke/routes.spec.js` asserts hero CTAs.            |
| Manual          | `GET /leaderboard` in browser                                | Old bookmark redirects to `/stats`.                        |
