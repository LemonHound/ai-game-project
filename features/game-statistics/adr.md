# ADR: Game Statistics Architecture

## Context

The backend had a stub `/api/game/{game_id}/stats` endpoint returning hardcoded zeros. Real statistics
needed to be implemented on top of the game-data-persistence layer. Several architectural decisions
were required: how to compute stats, how to define streaks, how to handle abandoned games, whether
to make stats public or private by default, and how to scope leaderboards.

## Decisions

### 1. Compute on-read with 60-second server-side cache

Stats are derived from raw game records via SQL queries at request time, not pre-aggregated into a
separate table. Results are cached server-side for 60 seconds (same pattern as the About page stats).

Rationale: at current scale, SQL aggregation over per-user game records is fast. A separate
aggregation table would require keeping it in sync with every game write — added complexity for
no measured benefit. If queries become slow, the caching layer can be upgraded to a materialized view
or pre-aggregation table without changing the API contract.

### 2. Streak definition: consecutive wins

A win streak is broken by any loss or draw. Abandoned games are handled separately (see decision 3).

Rationale: "consecutive wins" is the universally understood definition. Alternatives
("unbeaten run" including draws, or "win percentage streak") are less intuitive and harder to explain
in the UI.

### 3. Abandoned game threshold: 4 hours

Three tiers based on context:

| Scenario | Counted as | Breaks streak? |
|----------|------------|----------------|
| Explicit forfeit / quit while playing | Loss | Yes |
| Abandon < 4 hours since last move | Loss | Yes |
| Abandon >= 4 hours since last move | Excluded from win rate and streak | No |

Rationale: a game abandoned hours after the last move is more likely a forgotten session than a
deliberate forfeit. Counting old abandoned games as losses would penalize users who step away from
a game overnight. The 4-hour threshold is measured from `last_move_at`, not game start time.

### 4. Stats private by default

Add `stats_public` boolean column to `users` table, defaulting to `false`. Users must explicitly
opt in to public stats via the Settings page.

Rationale: privacy-first default. Players should not have their game history visible to other users
unless they choose to share it. Leaderboards include only users with `stats_public = true`.

### 5. Per-game leaderboards only; no cross-game aggregates

Three leaderboard types per game: games played, streak high score, current streak. No global
cross-game leaderboards.

Rationale: games are not comparable. A Tic-Tac-Toe game takes seconds; a Chess game takes minutes.
A cross-game games-played leaderboard would be dominated by TTT spam. Siloing leaderboards per
game type incentivizes meaningful play within each game.

### 6. Consolidated stats endpoint

Replace the per-game stub (`GET /api/game/{game_id}/stats`) with a single `GET /api/stats/me`
endpoint returning stats for all game types in one response.

Rationale: the frontend needs stats for multiple contexts (profile page grid, per-game stats panel).
A single endpoint avoids N+1 API calls. The per-game stats panel on each game page reads from the
same cached response rather than issuing a separate request.

### 7. Streak calculation uses existing `(user_id, last_move_at)` index

Streak calculation requires ordering games by `last_move_at` per user per game type. The existing
`idx_{game_type}_games_user_id` index covers user_id lookups. A composite index on
`(user_id, last_move_at)` is added per game table if query plans show sequential scans under load.

This is a deferred optimization: measure first, add only if needed.
