# Game Training Data

**Status: needs implementation** — prior positions-table approach retired; move_list is the training record.

## Background

The previous version of this spec described `{game_type}_positions` tables: per-position frequency counters
keyed by state hash, intended for a counter-based RL approach. That model is retired. The ML team will
train from real human game histories (hundreds of thousands of master-level games) rather than accumulating
a small user-play dataset. The frequency counter approach adds complexity without corresponding ML value for
this training strategy.

The `game_difficulty` table and the difficulty update formula (logistic step on win/loss) are also retired.
AI difficulty is not tracked in the DB. It is a static, server-side configuration value used only for
display purposes in the `games` table; it does not change in response to game outcomes.

Training data is the `move_list` column on each `{game_type}_games` table, defined in the
`game-data-persistence` spec. No additional tables, capture contracts, or background tasks are required.

## What `move_list` Provides

Each completed (or in-progress) game record contains an ordered array of moves in standard notation.
This array supports two ML training modes:

1. **Sequence training:** feed `move_list` entries one at a time to train next-move prediction. The full
   game record is a labeled sequence where the outcome (`player_won`, `ai_won`, `is_draw`) provides the
   terminal signal.
2. **Position training:** replay `move_list` against `{GameEngine}.initial_state()` +
   `{GameEngine}.apply_move()` to reconstruct the board at any move N. Every intermediate position is
   recoverable without storing it.

`board_state` on the game record is the final (or current) board state only. It is a convenience field for
resume and validation, not a training input.

## Move Notation by Game Type

All move notations are stored as plain strings in the `TEXT[]` array. One entry per discrete move.

### Chess — UCI (Universal Chess Interface)

Format: `{from_square}{to_square}` with optional promotion suffix.

- Squares use algebraic column+rank: `a1`–`h8` (a=col 0, h=col 7; 1=row 7, 8=row 0)
- Normal move: `e2e4`
- Capture: `d5e6` (same format; capture is implied by destination)
- Kingside castling: `e1g1` (white), `e8g8` (black)
- Queenside castling: `e1c1` (white), `e8c8` (black)
- Promotion: `e7e8q` (queen), `e7e8r`, `e7e8b`, `e7e8n` — append piece letter, lowercase
- En passant: `d5c6` (same format; server logic handles the captured pawn removal)

Example `move_list` for first four half-moves of a game:
```
["e2e4", "e7e5", "g1f3", "b8c6"]
```

Move order is always: white's move, black's move, white's move, ... White always moves first in chess
regardless of which color the player chose. The player's color is derivable from `board_state` or from the
game engine's initial state.

### Tic-Tac-Toe

Format: `r{row}c{col}` — zero-indexed, row 0 = top, col 0 = left.

- Range: `r0c0` – `r2c2`
- Example: `r1c2` (center-right cell)

Example:
```
["r1c1", "r0c0", "r2c2", "r0c2", "r0c1"]
```

### Connect 4

Format: `c{col}` — zero-indexed, col 0 = leftmost.

- Range: `c0` – `c6`
- Example: `c3` (drop piece in center column)

Example:
```
["c3", "c3", "c4", "c2", "c4"]
```

### Checkers

Format: `{from_square}{to_square}` — algebraic coordinate, column letter (a–h) + row number (1–8,
row 1 = top). Pieces only occupy dark squares; notation still uses the full coordinate of start/end.

- Normal move: `b6c5`
- Capture jump: `b6d4` (from b6, jumping over c5 to d4)
- Multi-jump: each individual jump is a separate entry in `move_list`

Example (multi-jump recorded as two entries):
```
["b6d4", "d4f2"]
```

### Dots and Boxes

Format: `{type}{row}{col}` — type is `h` (horizontal edge) or `v` (vertical edge). Zero-indexed.

For a 4×4 grid of boxes:
- Horizontal edges: row 0–4, col 0–3 → `h00` – `h43`
- Vertical edges: row 0–3, col 0–4 → `v00` – `v34`

Example:
```
["h00", "v04", "h11", "v10"]
```

## Querying Training Data

Training data is read directly from the `{game_type}_games` tables. For chess:

```sql
SELECT id, move_list, player_won, ai_won, is_draw
FROM chess_games
WHERE game_ended = true
  AND game_abandoned = false
  AND array_length(move_list, 1) > 0;
```

This query is run against the production Cloud SQL instance only for batch export — not from application
code. When the ML pipeline is productionized, completed game data will be migrated to BigQuery (see
game-data-persistence spec: Data Lifecycle section).

## What Was Retired

The following from the previous version of this spec are removed and must not be implemented:

- `{game_type}_positions` tables (state_hash, encounter_count, outcome columns)
- `game_difficulty` table
- `record_position()` async function
- Difficulty update formula (logistic step on win/loss)
- Outcome backfill background task
- `ai_difficulty` bucketing logic

If any of these exist in the DB at migration time, they are dropped (see game-data-persistence migration
plan).

## Test Cases

| Tier | Name | What it checks |
|------|------|----------------|
| Unit | `test_chess_uci_notation_stored` | `record_move()` with a UCI string stores it verbatim in `move_list` |
| Unit | `test_move_list_append_order` | After N moves, `move_list` length equals N and order is preserved |
| Unit | `test_position_replay_from_move_list` | Replaying all entries in `move_list` via engine `apply_move` produces a board matching `board_state` |
| API integration | `completed_game_move_list_queryable` | Completed game record contains full `move_list` retrievable by direct DB query |
| Manual | Export query | Run the training data query against Cloud SQL after a completed chess game; verify `move_list` contains correct UCI strings |
