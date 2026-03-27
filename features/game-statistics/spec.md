# Game Statistics Spec

**Status: ready** (best done after at least one game is implemented)

## Background

The backend exposes `/api/game/{game_id}/stats` which currently returns hardcoded zeros for all fields
(`gamesPlayed`, `winRate`, `bestStreak`, `aiLevel`). There is no actual statistics calculation or storage.
The game-data-persistence feature will be the source of truth for raw game records; this feature defines the
aggregation layer on top of that data.

## Scope

Implement statistics calculation and exposure for:
- **Per-game stats** (scoped to one game, one user): games played, win/loss/draw counts, win rate, best win
  streak, average game duration
- **Cross-game aggregate stats** (all games, one user): total games played, overall win rate, most-played game,
  favourite game by win rate
- **Global / leaderboard stats** (all users, one game): top players by win rate or total wins — likely a
  later-phase addition

## Known Requirements

- Depends on game-data-persistence: stats are derived from game session and outcome records; this feature
  cannot be fully implemented until persistence is in place
- The existing `/api/game/{game_id}/stats` endpoint should be updated rather than replaced
- A new `/api/stats/me` or `/api/profile/stats` endpoint is likely needed for cross-game aggregates
- Stats must be scoped to authenticated users; unauthenticated requests return empty/default values
- Stats queries must use parameterized statements (psycopg2 cursor.execute)
- Mobile + desktop responsive presentation wherever stats are displayed

## Consumers (who uses this data)

- **Profile page** — aggregate stats summary
- **Game pages** — per-game stats for the current user (wins, streak, etc.)
- **Leaderboard** (future) — global stats per game

## Open Questions

- Should stats be computed on-read (query over raw game records each time) or pre-aggregated and cached?
- What is the staleness tolerance? (Real-time vs. eventually consistent is fine for most stats)
- What counts as a "completed" game for stats purposes? (Abandoned/forfeited games — include or exclude?)
- Streak definition: consecutive wins, or wins without a loss (draws don't break streak)?
- When the ML model is in place, should stats differentiate by AI difficulty level?
- Global leaderboard: is this in scope now or deferred? What are the privacy implications of public rankings?
- Should stats be exposed publicly (viewable on another user's profile) or private to the owner?

## Test Cases

_To be defined during planning session._
