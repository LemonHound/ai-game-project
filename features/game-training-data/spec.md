# Game Training Data

**Status: draft — depends on game-data-persistence (done)**

## Background

The `game-data-persistence` spec established a game record model: one row per game session in a
per-game `{game_type}_games` table, linked to a `game_sessions` row, with a `move_history` JSONB array
updated in place on every move. This model is well-suited for session management and game resume, but it
is not the right model for accumulating ML training data.

The goal of training data capture is not to record individual player games for review. It is to amass a
frequency table of game states across all games ever played, so that an RL model can learn which positions
it has seen many times, which moves it chose, and what outcomes resulted from them. The session-linked move
log is an operational concern; the training data store is an analytical concern. They are separate tables
serving separate purposes.

This spec defines the training data schema and the capture contract for turn-based games. Real-time game
capture (Pong) is explicitly out of scope — that schema is deferred pending resolution of how to handle
continuous-state frequency tracking (see `features/game-pong/spec.md`).

## Design Principles

1. **State-centric, not session-centric.** The unit of training data is a game state, not a session or a
   move sequence. Each unique (board position, game type, ai_difficulty) tuple has exactly one row.
2. **Counter-based accumulation.** Each time a game reaches a known position, its encounter counter
   increments. A position seen once is weak signal; a position seen 10,000 times is strong training signal.
3. **AI difficulty is a first-class differentiator.** The same board position encountered at difficulty
   0.2 vs 0.8 is a separate data point — outcomes may differ by training level. They must not be merged.
4. **Upsert semantics.** Every move write is an `INSERT ... ON CONFLICT DO UPDATE SET encounter_count =
   encounter_count + 1`. No pre-check query, no application-level dedup logic.
5. **Immediate writes, fire-and-forget.** Position rows are written as soon as a move is validated —
   before it is passed to the AI, and before the response is sent to the player. The write is async and
   non-blocking. A failure must never fail the game move request. Whether a session completes normally,
   is abandoned, or the player disconnects mid-game has no bearing on whether an encounter is recorded.
6. **AI response written async on AI turn.** After the AI computes its move, `record_position` is called
   for the resulting state before the response is dispatched to the client. If the player disconnects
   between the move request and the AI response, the AI's position row is still written.

## AI Difficulty

### What It Is

`difficulty` on `game_sessions` is a `FLOAT` in the range `[0.0, 1.0]` representing how well-trained
the AI is for that game type at the time the session was created. It is set once at session creation from
a server-side per-game config value and never changes for that session.

- `0.0` = completely untrained (random behavior)
- `1.0` = theoretical perfection (unreachable in practice due to diminishing returns)
- Current starting value: `0.0` (all existing rows currently have `"very easy"` — see migration)

This value is **global per game type** — it is not player-selectable, not per-session-configurable, and
not exposed as a setting anywhere in the UI. Players see a human-readable label derived from the value
(see Display below). It reflects a property of the AI, not a player preference.

### Display Labels

The frontend maps the float to a display label for informational purposes (e.g. on the game card or game
page header):

| Range | Label |
|-------|-------|
| `[0.0, 0.15)` | Very Easy |
| `[0.15, 0.35)` | Easy |
| `[0.35, 0.55)` | Medium |
| `[0.55, 0.75)` | Hard |
| `[0.75, 0.90)` | Very Hard |
| `[0.90, 1.0]` | Impossible |

These thresholds are constants in the frontend — no API endpoint is needed to resolve a label. The raw
float value is never displayed to the player.

### Update Formula

After each completed (non-abandoned) game session, the difficulty value for that game type is updated
using a logistic step:

```
delta = learning_rate * current * (1 - current)

if player_won:
    new_difficulty = current - delta
elif ai_won:
    new_difficulty = current + delta
# draw: no update

new_difficulty = clamp(new_difficulty, 0.0, 1.0)
```

The `current * (1 - current)` term (the derivative of the logistic function) provides the diminishing
returns: the step size is largest near `0.5` and approaches zero near `0.0` and `1.0`. This means the AI
moves quickly through "Easy" and "Medium" with early wins but slows asymptotically toward the extremes.

`learning_rate` is a server-side config constant, set per game type. A reasonable starting value is `0.05`
(5% of the maximum step). This can be tuned as real game data accumulates.

The update runs at the end of `end_game_session`, after the session outcome booleans are set. It is a
direct DB update to a `game_difficulty` table (see schema). It does not modify the `game_sessions` row
— that row retains the difficulty value at the time the session was created, which is intentional for
historical analysis.

### Per-Game Independence

Each game type has its own difficulty value. Chess may be at `0.12` while TTT is at `0.68`. The values
evolve independently based on win/loss rates for each game.

### Schema: `game_difficulty`

| Column | Type | Notes |
|--------|------|-------|
| game_type | VARCHAR PK | one row per game type |
| difficulty | FLOAT | `[0.0, 1.0]`, DB check constraint enforced |
| learning_rate | FLOAT | per-game tuning constant; default `0.05` |
| updated_at | TIMESTAMPTZ | timestamp of last difficulty update |

This table has exactly one row per game type. It is initialized at migration time with `difficulty = 0.0`
for all current game types. The server reads this value at session creation and stamps it on the
`game_sessions` row.

## Schema: `{game_type}_positions`

e.g. `tic_tac_toe_positions`, `chess_positions`, `checkers_positions`, `connect4_positions`,
`dots_and_boxes_positions`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| state_hash | VARCHAR(64) | SHA-256 of canonical board state; unique together with `ai_difficulty` |
| game_type | VARCHAR | redundant for query convenience |
| ai_difficulty | FLOAT | value of `game_sessions.difficulty` at time of encounter; bucketed (see below) |
| board_state | JSONB | full board state (same format as `current_board_state` in `{game_type}_games`) |
| last_move | JSONB | the move played to reach this state; NULL for the initial position |
| outcome_player_won | INT | encounters where the session ended in player win |
| outcome_ai_won | INT | encounters where the session ended in AI win |
| outcome_draw | INT | encounters where the session ended in draw |
| outcome_abandoned | INT | encounters where the session was abandoned |
| encounter_count | INT | incremented immediately on each encounter |
| first_seen_at | TIMESTAMPTZ | |
| last_seen_at | TIMESTAMPTZ | updated on every encounter |

Unique constraint: `(state_hash, ai_difficulty)`.

### ai_difficulty Bucketing

Storing the raw float as the differentiator would create a separate row for every tiny difficulty shift,
defeating the counter model. Instead, `ai_difficulty` in the positions table is the float value
**rounded to one decimal place** (e.g. `0.23` → `0.2`, `0.87` → `0.9`). This creates 11 buckets across
`[0.0, 1.0]` — coarse enough for counters to accumulate meaningfully, fine enough to distinguish
meaningfully different AI training levels.

The bucketing is applied in `record_position` before the upsert. The raw difficulty value is still
recorded accurately on `game_sessions` for historical analysis.

### State Hash

SHA-256 hex digest of a canonical JSON serialization of `board_state_after`. Canonical means: consistent
key ordering, no whitespace, all values in a deterministic representation. Implemented once per game type
in the game engine. Must be stable across deploys — a hash function change invalidates all historical
dedup and requires a full re-hash migration.

### Capture Contract

```python
async def record_position(session_id, board_state, last_move, game_type, ai_difficulty) -> None
```

Called immediately after `record_move`. Computes the bucketed difficulty and hash, then upserts:

```sql
INSERT INTO {game_type}_positions
    (state_hash, game_type, ai_difficulty, board_state, last_move,
     encounter_count, first_seen_at, last_seen_at)
VALUES (...)
ON CONFLICT (state_hash, ai_difficulty) DO UPDATE SET
    encounter_count = {game_type}_positions.encounter_count + 1,
    last_seen_at = now()
```

`last_move` is the move that was just played to arrive at `board_state` — useful for position
reconstruction and as optional context for the AI, but not attributed to player or AI. On the initial
position (game start, before any move), `last_move` is NULL. Every row is a game state; `last_move` is
context, not the primary data.

Failures are logged and swallowed — must not propagate to the game endpoint.

### Outcome Backfill

When `end_game_session` is called, an async background task bulk-increments the appropriate outcome column
on all position rows encountered during the session. It reads the session's `move_history` JSONB array
from the `{game_type}_games` row, recomputes the `(state_hash, bucketed_difficulty)` pair for each entry,
and issues a batch update against the positions table. This runs after the session is marked ended; the
game endpoint does not wait for it.

`encounter_count` is already incremented in real time. The outcome columns lag by one session — this is
acceptable; they are analytical, not operational.

## Relationship to Game Records

The `{game_type}_games` tables (defined in `game-data-persistence`) serve session management, game resume,
and the state recovery endpoint. The `{game_type}_positions` tables serve ML training. Both are updated on
every move. They have no FK relationship to each other — a game record row and its corresponding position
rows share `board_state` content but are independent records.

## Migration

1. Drop `game_sessions.difficulty` VARCHAR column; add `game_sessions.difficulty` FLOAT with check
   constraint `difficulty >= 0.0 AND difficulty <= 1.0`; all existing rows set to `0.0`
2. Create `game_difficulty` table; seed one row per game type with `difficulty = 0.0,
   learning_rate = 0.05`
3. Create `{game_type}_positions` tables via Alembic autogenerate
4. Remove any frontend references to difficulty as a player-selectable parameter (API request models,
   frontend UI dropdowns, any `difficulty` field on `NewGameRequest` models)
5. Add `record_position` and difficulty-update logic to `persistence_service.py`
6. Wire `record_position` after `record_move` in all game routers
7. Wire difficulty update into `end_game_session`
8. Add outcome backfill task to `end_game_session`

## Resolved Design Decisions (formerly open questions)

- **Move attribution**: Every row is a game state, not a move pairing. `last_move` captures the move played
  to reach the state for context and reconstruction — it carries no player/AI attribution. The AI receives
  a board state as input and does not need to know who made the last move.
- **Symmetry normalization**: No normalization. Every position stands alone, including rotations and mirrors
  for TTT, Connect4, Checkers, and Chess. Merging equivalent positions would require unfolding weights later
  and adds complexity with no clear training benefit given the counter model.
- **Chess position explosion**: Accepted and intentional. Most chess positions will accumulate low counts
  except for common openings and endgames — and that concentration is exactly the signal the model needs.
  No special-case logic, no storage cap. The goal is training from scratch via human interaction, not from
  pre-loaded opening libraries; counters on common positions will naturally emerge over time.
- **Pong**: Out of scope for this spec. The pong game loop writes to a stub that discards rally data.
  A future spec will define the discretization strategy and schema once real rally data is available to
  reason about (see `features/game-pong/spec.md`).

## Test Cases

| # | Scenario | Tier | Test Name |
|---|----------|------|-----------|
| 1 | Same board state reached twice: `encounter_count` = 2 | unit | `position_counter_increments_on_repeat` |
| 2 | Same board at difficulty 0.2 vs 0.3 (different buckets): two rows | unit | `position_difficulty_bucket_creates_separate_row` |
| 3 | Same board at difficulty 0.21 vs 0.27 (same bucket): one row, count = 2 | unit | `position_difficulty_bucket_merges_same_bucket` |
| 4 | `record_position` failure does not fail the game move request | unit | `record_position_failure_swallowed` |
| 5 | State hash is deterministic for the same board | unit | `state_hash_is_deterministic` |
| 6 | State hash differs for distinct boards | unit | `state_hash_distinct_for_different_boards` |
| 7 | AI wins: `game_difficulty.difficulty` increases after session end | unit | `difficulty_increases_on_ai_win` |
| 8 | Player wins: `game_difficulty.difficulty` decreases after session end | unit | `difficulty_decreases_on_player_win` |
| 9 | Draw: `game_difficulty.difficulty` unchanged after session end | unit | `difficulty_unchanged_on_draw` |
| 10 | Difficulty clamped to `[0.0, 1.0]` at extremes | unit | `difficulty_clamped_at_bounds` |
| 11 | `difficulty * (1 - difficulty)` step approaches 0 near 0.0 and 1.0 | unit | `difficulty_step_diminishing_returns` |
| 12 | Making a move produces a position row with correct hash, `last_move`, and bucketed difficulty | API integration | `move_creates_position_row` |
| 13 | `encounter_count` increments correctly across two separate sessions | API integration | `encounter_count_cross_session` |
| 14 | Outcome columns incremented after `end_game_session` | API integration | `outcome_backfill_on_session_end` |
| 15 | New session stamped with current `game_difficulty.difficulty` | API integration | `session_stamped_with_current_difficulty` |
| 16 | Player disconnects mid-game: AI position row still written | API integration | `ai_position_written_on_player_disconnect` |
| 17 | All existing `"very easy"` rows migrated to `0.0` float | manual | Query `game_sessions` post-migration; confirm no string values in `difficulty` |
| 18 | No player-facing difficulty selector present in UI | manual | Review all game pages; confirm difficulty is display-only, no input control |
