# Game Statistics Spec

**Status: ready**

## Background

The backend exposes `/api/game/{game_id}/stats` which currently returns hardcoded zeros for all fields (`gamesPlayed`,
`winRate`, `bestStreak`, `aiLevel`). There is no actual statistics calculation or storage. The game-data-persistence
feature is the source of truth for raw game records; this feature defines the aggregation layer on top of that data.

## Scope

Implement statistics calculation and exposure for:

- **Per-game stats** (scoped to one game, one user): games played, win/loss/draw counts, win rate, best win streak,
  current streak, average game duration
- **Per-game leaderboards** (all users, one game type): rankings by games played, streak high score, and current streak

All statistics are strictly per-game. No cross-game aggregates or global leaderboards exist in this feature. Games are
not comparable (TTT takes seconds, chess takes minutes), so we keep them siloed to avoid incentivizing users to spam
short games.

## Decisions

### Streak definition

**Consecutive wins.** A streak breaks on any loss or draw. Simple and intuitive.

### Abandoned / forfeited games

Three rules based on context:

| Scenario                                                      | Counts as                        | Affects streak?             |
| ------------------------------------------------------------- | -------------------------------- | --------------------------- |
| Quit while actively playing (close tab, forfeit button, etc.) | Loss                             | Yes -- breaks streak        |
| Abandon a game < 4 hours old                                  | Loss                             | Yes -- breaks streak        |
| Abandon a game >= 4 hours old                                 | Tracked separately ("abandoned") | No -- does not break streak |

Implementation: the `game_abandoned` boolean is already stored. The 4-hour threshold is determined by comparing
`NOW() - last_move_at >= 4 hours` (time since last activity, not game duration). "Quit while playing" is distinguished
by the frontend sending an explicit forfeit action vs. the game timing out on the server side.

A "completed game" for stats purposes =
`game_ended = true AND NOT (game_abandoned = true AND NOW() - last_move_at >= 4 hours)`. Abandoned-old games are
excluded from win rate and streak calculations but counted in a separate `games_abandoned` field.

### Stats privacy

**User-controlled toggle.** Players choose whether their stats are public or private.

- Add `stats_public` boolean column to `users` table (default: `false` -- private by default).
- Toggle exposed via Settings page.
- When private: only the owner sees their stats on their profile.
- When public: any authenticated user can view another player's stats.
- Leaderboards only include users with `stats_public = true`.

### Leaderboards

**Per-game leaderboards only.** Three leaderboard views per game type:

| Leaderboard                    | Scope            | Ranked by                               |
| ------------------------------ | ---------------- | --------------------------------------- |
| Per-Game Games Played          | Single game type | Completed games for that type           |
| Per-Game Streak High Score     | Single game type | Best all-time win streak for that type  |
| Per-Game Current Streak Leader | Single game type | Longest active win streak for that type |

Leaderboards are paginated (default 10 per page). Only users with `stats_public = true` appear. A `game_type` query
parameter is required for all leaderboard requests.

### Computation strategy

**Compute on-read with server-side caching.** Stats are derived from raw game records via SQL queries. Cache results for
60 seconds (same pattern as About page stats). This avoids a separate aggregation table for now; if performance becomes
an issue, pre-aggregated materialized views can be added later.

Streak calculation requires ordering games by `last_move_at` per user per game type, which is efficient with the
existing `idx_{game_type}_games_user_id` index. Add a composite index on `(user_id, last_move_at)` per game table if
query plans show sequential scans.

## Known Requirements

- Depends on game-data-persistence (complete): stats are derived from `{game_type}_games` records
- The existing `/api/game/{game_id}/stats` stub endpoint is removed and replaced by the consolidated `/api/stats/me`
  endpoint
- Stats must be scoped to authenticated users; unauthenticated requests return empty/default values
- Game types without persistence (e.g., Pong) return zeros for all stats fields
- Stats queries use SQLAlchemy async (AsyncSession) -- consistent with the persistence layer
- Mobile + desktop responsive presentation wherever stats are displayed

## API Endpoints

### 1. `GET /api/stats/me` (new)

Returns per-game stats for the authenticated user. The frontend uses this one endpoint for both the profile page
(per-game grid) and individual game pages (per-game stats panel), avoiding multiple API calls. No auth = empty defaults
(zeros).

The `per_game` object includes an entry for every known game type, including those without persistence (e.g., Pong).
Missing data returns zeros for all fields.

```json
{
    "per_game": {
        "tic_tac_toe": {
            "games_played": 42,
            "wins": 25,
            "losses": 12,
            "draws": 3,
            "games_abandoned": 2,
            "win_rate": 0.625,
            "best_streak": 7,
            "current_streak": 3,
            "avg_duration_seconds": 184.5
        },
        "chess": {
            "games_played": 30,
            "wins": 16,
            "losses": 10,
            "draws": 2,
            "games_abandoned": 2,
            "win_rate": 0.571,
            "best_streak": 4,
            "current_streak": 0,
            "avg_duration_seconds": 420.0
        },
        "checkers": {
            "games_played": 20,
            "wins": 13,
            "losses": 5,
            "draws": 1,
            "games_abandoned": 1,
            "win_rate": 0.684,
            "best_streak": 5,
            "current_streak": 2,
            "avg_duration_seconds": 310.0
        },
        "connect4": {
            "games_played": 25,
            "wins": 18,
            "losses": 7,
            "draws": 0,
            "games_abandoned": 0,
            "win_rate": 0.72,
            "best_streak": 11,
            "current_streak": 3,
            "avg_duration_seconds": 95.0
        },
        "dots_and_boxes": {
            "games_played": 11,
            "wins": 5,
            "losses": 4,
            "draws": 2,
            "games_abandoned": 0,
            "win_rate": 0.455,
            "best_streak": 3,
            "current_streak": 0,
            "avg_duration_seconds": 260.0
        },
        "pong": {
            "games_played": 0,
            "wins": 0,
            "losses": 0,
            "draws": 0,
            "games_abandoned": 0,
            "win_rate": 0,
            "best_streak": 0,
            "current_streak": 0,
            "avg_duration_seconds": 0
        }
    }
}
```

The existing stub `GET /api/game/{game_id}/stats` is removed.

### 2. `GET /api/stats/user/{user_id}` (new)

Returns stats for another user. Returns 403 if the target user has `stats_public = false`. Same response shape as
`/api/stats/me`.

### 3. `GET /api/leaderboard/{board_type}` (new)

Returns a paginated per-game leaderboard. Query params: `game_type` (required), `page`, `per_page` (default 10, max 50).

`board_type` is one of: `games_played`, `streak_high_score`, `current_streak`.

```json
{
    "board_type": "streak_high_score",
    "game_type": "chess",
    "entries": [
        { "rank": 1, "user_id": 12, "display_name": "Alice", "value": 15 },
        { "rank": 2, "user_id": 7, "display_name": "Bob", "value": 12 }
    ],
    "page": 1,
    "per_page": 10,
    "total_entries": 38
}
```

## Frontend

### Per-game stats panel

Displayed on each game page below the game board (or in a sidebar on desktop). Shows the user's stats for that game:
games played, win rate, current streak, best streak. The data comes from the `per_game` field of the cached
`/api/stats/me` response -- no separate API call needed.

### Profile stats section

On the profile page, show a per-game breakdown grid from `/api/stats/me`. Each game type gets a mini card showing games
played, win rate, and best streak.

### Stats page (public rankings)

Primary route: `/stats` (nav label **Stats**). Legacy `/leaderboard` redirects to `/stats`. Tabbed interface for the 3
board types (games played, streak high score, current streak). Each tab has a dropdown to select the game type. A
`game_type` is always required. Paginated table with rank, display name, and value.

### Settings toggle

Add a "Public stats" toggle to the Settings page. Create a new `PATCH /api/auth/settings` endpoint (no existing settings
endpoint exists). The endpoint lives in `auth.py` for organizational consistency with other user/account routes.

## Database Changes

### Users table

Add column:

```sql
ALTER TABLE users ADD COLUMN stats_public BOOLEAN NOT NULL DEFAULT false;
```

### Indexes (if needed for performance)

Add composite indexes per game table:

```sql
CREATE INDEX idx_{game_type}_games_user_completed
  ON {game_type}_games (user_id, last_move_at)
  WHERE game_ended = true;
```

## Files to Create/Modify

| Action | File                                                                                      |
| ------ | ----------------------------------------------------------------------------------------- |
| Create | `src/backend/auth_deps.py` -- shared auth dependencies (require_user, optional_user)      |
| Create | `src/backend/stats.py` -- stats router with stats + leaderboard endpoints                 |
| Create | `scripts/migrations/versions/0005_add_stats_public_column.py` -- migration                |
| Create | `src/frontend/src/api/stats.ts` -- API fetch functions                                    |
| Create | `src/frontend/src/pages/StatsPage.tsx` -- public rankings page                            |
| Create | `src/frontend/src/components/games/GameStatsPanel.tsx` -- per-game stats component        |
| Modify | `src/backend/app.py` -- register stats router                                             |
| Modify | `src/backend/auth.py` -- remove stats stub, add PATCH settings, add statsPublic to /me    |
| Modify | `src/backend/games.py` -- remove existing `/api/game/{game_id}/stats` stub, use auth_deps |
| Modify | `src/frontend/src/types/index.ts` -- add stats types                                      |
| Modify | `src/frontend/src/App.tsx` -- add `/stats` route; redirect `/leaderboard` to `/stats`     |
| Modify | `src/frontend/src/components/Navbar.tsx` -- add Stats nav link                            |
| Modify | `src/frontend/src/pages/ProfilePage.tsx` -- add per-game stats grid                       |
| Modify | `src/frontend/src/pages/SettingsPage.tsx` -- add stats_public toggle                      |
| Modify | All game page components -- add `<GameStatsPanel>`                                        |

## Test Cases

| Tier            | Name                                                    | What it checks                                                                                              |
| --------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| API integration | `GET /api/stats/me returns per-game stats`              | Authenticated user gets per_game map with correct types                                                     |
| API integration | `GET /api/stats/me returns zeros when unauthenticated`  | No auth returns zeros for all fields                                                                        |
| API integration | `GET /api/stats/me includes all game types`             | Response per_game object has entries for every known game type, including those without persistence (zeros) |
| API integration | `GET /api/stats/user/{id} respects privacy toggle`      | Returns 403 when target user has stats_public=false; 200 when true                                          |
| API integration | `GET /api/leaderboard/{type} returns paginated results` | Entries sorted correctly; pagination params work; only public users included                                |
| API integration | `GET /api/leaderboard/{type} requires game_type`        | Returns 400 when game_type query param is missing                                                           |
| API integration | `PATCH /api/auth/settings updates stats_public`         | Toggle on/off, verify /me reflects change                                                                   |
| Unit            | `streak calculation handles consecutive wins`           | Streak of 5 wins returns 5; loss after 5 wins resets to 0                                                   |
| Unit            | `streak ignores old abandoned games`                    | Game abandoned after 4+ hours does not break streak                                                         |
| Unit            | `recent abandoned game counts as loss`                  | Game abandoned under 4 hours breaks streak and counts as loss                                               |
| Unit            | `win rate excludes old abandoned games`                 | Old abandoned games excluded from win rate denominator                                                      |
| E2E             | `Game page shows stats panel after playing`             | Play a game, verify stats panel updates with new game count                                                 |
| E2E             | `Profile page shows per-game stats`                     | Navigate to profile, verify per-game grid displays                                                          |
| E2E             | `Stats page loads with game selector`                   | Navigate to /stats, select game, verify table renders                                                       |
| E2E             | `Stats privacy toggle works`                            | Toggle stats_public in settings, verify other user can/cannot see stats                                     |
| Manual          | `Leaderboard only shows public users`                   | Create users with different privacy settings, verify leaderboard filtering                                  |
| Manual          | `Stats are accurate after multiple games`               | Play several games across types, verify all numbers match expected values                                   |
