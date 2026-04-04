# Game Statistics Spec

**Status: ready**

## Background

The backend exposes `/api/game/{game_id}/stats` which currently returns hardcoded zeros for all fields
(`gamesPlayed`, `winRate`, `bestStreak`, `aiLevel`). There is no actual statistics calculation or storage.
The game-data-persistence feature is the source of truth for raw game records; this feature defines the
aggregation layer on top of that data.

## Scope

Implement statistics calculation and exposure for:
- **Per-game stats** (scoped to one game, one user): games played, win/loss/draw counts, win rate, best win
  streak, current streak, average game duration
- **Cross-game aggregate stats** (all games, one user): total games played, overall win rate, most-played game,
  favourite game by win rate
- **Leaderboards** (all users): global and per-game rankings by games played, streak high score, and current
  streak

## Decisions

### Streak definition

**Consecutive wins.** A streak breaks on any loss or draw. Simple and intuitive.

### Abandoned / forfeited games

Three rules based on context:

| Scenario | Counts as | Affects streak? |
|----------|-----------|-----------------|
| Quit while actively playing (close tab, forfeit button, etc.) | Loss | Yes — breaks streak |
| Abandon a game < 4 hours old | Loss | Yes — breaks streak |
| Abandon a game >= 4 hours old | Tracked separately ("abandoned") | No — does not break streak |

Implementation: the `game_abandoned` boolean is already stored. Add an `abandoned_at` timestamp (or
derive from `last_move_at`) and compare `last_move_at - created_at` to determine the 4-hour threshold.
"Quit while playing" is distinguished by the frontend sending an explicit forfeit action vs. the game
timing out on the server side.

A "completed game" for stats purposes = `game_ended = true AND NOT (game_abandoned = true AND
age >= 4 hours)`. Abandoned-old games are excluded from win rate and streak calculations but counted in
a separate `games_abandoned` field.

### Stats privacy

**User-controlled toggle.** Players choose whether their stats are public or private.

- Add `stats_public` boolean column to `users` table (default: `false` — private by default).
- Toggle exposed via Settings page.
- When private: only the owner sees their stats on their profile.
- When public: any authenticated user can view another player's stats.
- Leaderboards only include users with `stats_public = true`.

### Leaderboards

**Both global and per-game leaderboards.** Six leaderboard views:

| Leaderboard | Scope | Ranked by |
|-------------|-------|-----------|
| Global Games Played | All games combined | Total completed games |
| Per-Game Games Played | Single game type | Completed games for that type |
| Global Streak High Score | All games combined | Best all-time win streak across any game |
| Per-Game Streak High Score | Single game type | Best all-time win streak for that type |
| Global Current Streak Leader | All games combined | Longest active win streak across any game |
| Per-Game Current Streak Leader | Single game type | Longest active win streak for that type |

Leaderboards are paginated (default 10 per page). Only users with `stats_public = true` appear.

### Computation strategy

**Compute on-read with server-side caching.** Stats are derived from raw game records via SQL queries.
Cache results for 60 seconds (same pattern as About page stats). This avoids a separate aggregation
table for now; if performance becomes an issue, pre-aggregated materialized views can be added later.

Streak calculation requires ordering games by `last_move_at` per user per game type, which is
efficient with the existing `idx_{game_type}_games_user_id` index. Add a composite index on
`(user_id, last_move_at)` per game table if query plans show sequential scans.

## Known Requirements

- Depends on game-data-persistence (complete): stats are derived from `{game_type}_games` records
- The existing `/api/game/{game_id}/stats` endpoint should be updated rather than replaced
- Stats must be scoped to authenticated users; unauthenticated requests return empty/default values
- Stats queries use SQLAlchemy async (AsyncSession) — consistent with the persistence layer
- Mobile + desktop responsive presentation wherever stats are displayed

## API Endpoints

### 1. `GET /api/game/{game_type}/stats` (update existing)

Returns per-game stats for the authenticated user. No auth = empty defaults.

```json
{
  "games_played": 42,
  "wins": 25,
  "losses": 12,
  "draws": 3,
  "games_abandoned": 2,
  "win_rate": 0.625,
  "best_streak": 7,
  "current_streak": 3,
  "avg_duration_seconds": 184.5
}
```

### 2. `GET /api/stats/me` (new)

Returns cross-game aggregate stats for the authenticated user.

```json
{
  "total_games_played": 128,
  "total_wins": 71,
  "total_losses": 42,
  "total_draws": 8,
  "total_abandoned": 7,
  "overall_win_rate": 0.586,
  "best_streak": 11,
  "current_streak": 3,
  "most_played_game": "tic_tac_toe",
  "best_win_rate_game": "connect4",
  "per_game": {
    "tic_tac_toe": { "games_played": 42, "win_rate": 0.6 },
    "chess": { "games_played": 30, "win_rate": 0.53 },
    "checkers": { "games_played": 20, "win_rate": 0.65 },
    "connect4": { "games_played": 25, "win_rate": 0.72 },
    "dots_and_boxes": { "games_played": 11, "win_rate": 0.45 }
  }
}
```

### 3. `GET /api/stats/user/{user_id}` (new)

Returns stats for another user. Returns 403 if the target user has `stats_public = false`.
Same response shape as `/api/stats/me`.

### 4. `GET /api/leaderboard/{board_type}` (new)

Returns a paginated leaderboard. Query params: `game_type` (optional, omit for global), `page`,
`per_page` (default 10, max 50).

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

Displayed on each game page below the game board (or in a sidebar on desktop). Shows the user's
stats for that game: games played, win rate, current streak, best streak. Uses the existing
`/api/game/{game_type}/stats` endpoint.

### Profile stats section

On the profile page, show aggregate stats from `/api/stats/me`: total games, overall win rate,
best streak, most-played game. Include a mini per-game breakdown grid.

### Leaderboard page

New route: `/leaderboard`. Tabbed interface for the 3 board types (games played, streak high score,
current streak). Each tab has a toggle or dropdown to switch between global and per-game views.
Paginated table with rank, display name, and value.

### Settings toggle

Add a "Public stats" toggle to the Settings page. Uses a new `PATCH /api/auth/settings` field
or updates the existing user settings endpoint.

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

| Action | File |
|--------|------|
| Create | `src/backend/stats.py` — stats router with all 4 endpoints |
| Create | `src/frontend/src/api/stats.ts` — API fetch functions |
| Create | `src/frontend/src/pages/LeaderboardPage.tsx` — leaderboard page |
| Create | `src/frontend/src/components/GameStatsPanel.tsx` — per-game stats component |
| Create | `scripts/migrations/versions/NNNN_add_stats_public_column.py` — migration |
| Modify | `src/backend/app.py` — register stats router |
| Modify | `src/frontend/src/App.tsx` — add `/leaderboard` route |
| Modify | `src/backend/games.py` — update existing `/api/game/{game_id}/stats` stub |
| Modify | `src/frontend/src/pages/ProfilePage.tsx` — add aggregate stats section |
| Modify | `src/frontend/src/pages/SettingsPage.tsx` — add stats_public toggle |
| Modify | All game page components — add `<GameStatsPanel>` |

## Test Cases

| Tier | Name | What it checks |
|------|------|----------------|
| API integration | `GET /api/game/{type}/stats returns user stats` | Authenticated user gets correct per-game stats; fields present with correct types |
| API integration | `GET /api/game/{type}/stats returns defaults when unauthenticated` | No auth returns zeros |
| API integration | `GET /api/stats/me returns cross-game aggregates` | All fields present; per_game breakdown matches individual game stats |
| API integration | `GET /api/stats/user/{id} respects privacy toggle` | Returns 403 when target user has stats_public=false; 200 when true |
| API integration | `GET /api/leaderboard/{type} returns paginated results` | Entries sorted correctly; pagination params work; only public users included |
| Unit | `streak calculation handles consecutive wins` | Streak of 5 wins returns 5; loss after 5 wins resets to 0 |
| Unit | `streak ignores old abandoned games` | Game abandoned after 4+ hours does not break streak |
| Unit | `recent abandoned game counts as loss` | Game abandoned under 4 hours breaks streak and counts as loss |
| Unit | `win rate excludes old abandoned games` | Old abandoned games excluded from win rate denominator |
| E2E | `Game page shows stats panel after playing` | Play a game, verify stats panel updates with new game count |
| E2E | `Profile page shows aggregate stats` | Navigate to profile, verify total games and win rate display |
| E2E | `Leaderboard page loads and shows rankings` | Navigate to /leaderboard, verify table renders with ranked entries |
| E2E | `Stats privacy toggle works` | Toggle stats_public in settings, verify other user can/cannot see stats |
| Manual | `Leaderboard only shows public users` | Create users with different privacy settings, verify leaderboard filtering |
| Manual | `Stats are accurate after multiple games` | Play several games across types, verify all numbers match expected values |
