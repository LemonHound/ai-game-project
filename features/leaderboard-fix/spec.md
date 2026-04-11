# Leaderboard Fix

## Problem

The leaderboard page shows "No entries yet. Play some games!" for every game/board-type combination, even for users who have played games.

### Root Cause

The leaderboard query in `src/backend/stats.py` (lines 321, 342, 380) filters entries to `WHERE stats_public = TRUE`. The `stats_public` column defaults to `False` for all users (confirmed from `auth.py:151`). Seed test users also do not set `stats_public = True`.

Result: no user ever appears on the leaderboard unless they explicitly opt in via profile settings.

### Design Decision

There are two valid approaches:

**Option A — Change the default**: Set `stats_public = True` by default in the users table. Users who want privacy opt out.

**Option B — Fix the seed only**: Set `stats_public = True` for the seeded demo/test users, and update documentation to tell players they must enable stats in profile settings for leaderboard visibility. This is a weaker fix as real production users still won't appear.

**Option C — Remove the filter entirely**: The leaderboard is public information by nature (it's a leaderboard). Remove the `stats_public` filter from leaderboard queries and treat all game counts as public.

**Recommendation: Option A** — Change the DB default to `True`. The leaderboard is a core feature of the site. Privacy-conscious users can still opt out. Option B would cause the same complaint from any real user. Option C removes user control entirely.

If the team prefers Option B or C, this note captures the tradeoff.

## Scope

- `alembic` migration — alter `users.stats_public` default to `TRUE`, update existing rows to `TRUE`
- `scripts/seed_test_data.py` — set `stats_public = True` in the seed upsert (regardless of option chosen)
- No frontend changes required

## Acceptance Criteria

- Seeded users appear on the leaderboard after playing games
- Users who toggle `statsPublic = false` in profile settings are excluded from leaderboard
- Users who toggle `statsPublic = true` appear in leaderboard results
- The leaderboard page renders entries (not the empty-state message) when game data exists

## Test Cases

| Tier | Test name | Scenario |
|---|---|---|
| Integration | `test_leaderboard_stats_public_default` | Newly created user appears on leaderboard without explicit opt-in |
| Integration | `test_leaderboard_stats_private_excluded` | User with `stats_public=False` does not appear in leaderboard |
| API | `test_get_leaderboard_returns_entries` | `GET /api/stats/leaderboard/games_played?game_type=tic_tac_toe` returns entries after seed |
| Manual | Visit `/leaderboard` after playing a game | Entries visible without any profile settings change |

## Notes

- The migration must be backward-compatible: existing rows should be updated to `stats_public = TRUE` as part of the migration (opt-out model).
- The profile settings page already has a toggle for `statsPublic` — no UI changes needed.
