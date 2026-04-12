# Chess Bug Fixes

**Status: implemented**

## Background

Bugs from issue #98. Implement after `ux-game-standardization` and `ai-delay-config` are merged. Contains both frontend
display bugs and a backend persistence migration (FEN/SAN normalization). This is the largest per-game spec and should
be implemented in its own dedicated PR.

## Global Conventions (from per-game-bugs parent spec)

- **`board_state`**: valid FEN string after every applied move (instant resume and validation).
- **`move_list`**: SAN per half-move, append-only (human-readable and ML-friendly).
- **PGN**: regenerated from `move_list` + session metadata on demand; not stored as a growing blob.
- **Optimistic move rejection**: if the server rejects an optimistic move, snap to the server's authoritative
  `board_state` immediately with a user-visible error. No success animation for a rejected move.

## Bugs

### Bug 1: Player color at bottom

The player's pieces are always rendered at the top of the board regardless of which color they chose. The player's color
must always appear at the bottom (standard chess orientation).

**Fix**: When rendering the board, flip the rank/file indices when the player is playing Black.

### Bug 2: Piece images not used

Piece icons are showing as letters. Chess piece SVGs/PNGs exist in `/src/frontend/public/images/`. Use them.

**Fix**: Replace the letter fallback with `<img>` tags pointing to the correct image for each piece type and color.

### Bug 3: Captured pieces should use piece images

The captured pieces shown in the panel currently display as letters. Use the same scaled-down piece images from Bug 2.

**Fix**: Render captured piece images at ~60% size of board pieces, grouped by piece type.

### Bug 4: Board state and notation for resume, UI, and analysis (backend migration)

**Backend**: `board_state` must be a **valid FEN** string after every persisted move (replace arbitrary JSON shapes).
`move_list` holds **SAN** half-moves only (append-only). For consumers that need a **PGN document**, **regenerate** it
from `move_list` plus session metadata (player names, date, result); do not store an authoritative growing PGN column.

**Fix**: Normalize chess persistence to FEN + SAN. Wire PGN generation at export/API boundaries where the DS pipeline or
downloads need the full string.

### Bug 5: Move notation must be Algebraic Notation

The move list currently shows raw coordinate pairs (e.g. `e2-e4`). Display Standard Algebraic Notation (e.g. `e4`,
`Nf3`, `O-O`).

### Bug 6: Layout scrolls when move list is long

The page should never require vertical scrolling. When the move list grows, it should scroll internally within a
fixed-height container. Captured pieces panels and board layout must stay on screen at all viewport sizes.

**Fix**: Give the move list and captures panels `overflow-y: auto` with `max-height` computed from the board height.
Board height stays fixed.

## Scope

### Frontend

- `src/frontend/src/pages/games/ChessPage.tsx` — board orientation, layout, AN display, captures panel; optimistic
  rejection behavior (snap to server state + error on rejection)
- `src/frontend/src/components/games/ChessBoard.tsx` — piece image rendering, board flip for Black

### Backend

- Chess game persistence: `board_state` → FEN, `move_list` → SAN array, PGN regenerated when needed
- Alembic migration if the column schema changes (FEN string vs current JSON shape)

## Acceptance Criteria

- Player's pieces appear at the bottom regardless of chosen color
- Piece images rendered from `/public/images/` (not letter fallbacks)
- Captured pieces panel uses scaled piece images grouped by type
- `board_state` is a valid FEN string after every persisted move
- Move list displays SAN (not coordinate pairs)
- PGN can be regenerated from `move_list` + session metadata
- Page does not scroll at 1280×800 with 10+ moves and captures on both sides
- Rejected optimistic moves snap to server state with user-visible error; no success animation

## Test Cases

| Tier            | Test name                                         | Scenario                                                                                         |
| --------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Unit (Frontend) | `ChessBoard > renders piece images not letters`   | Piece element is an `<img>`, not text                                                            |
| Unit (Frontend) | `ChessBoard > flips board for black player`       | Rank 1 appears at bottom when playerColor=black                                                  |
| Unit (Python)   | `test_chess_move_stores_fen`                      | After each move, `board_state` is a valid FEN string                                             |
| Unit (Python)   | `test_chess_pgn_regenerated_from_moves`           | Given SAN `move_list` and metadata, regenerated PGN matches expected movetext/headers            |
| API             | `test_chess_move_response_has_algebraic_notation` | Move response includes AN string                                                                 |
| Unit (Frontend) | `optimisticMoveRejectedSnapsState`                | On move error response, board matches server payload and error UI shown; no completion animation |
| Manual          | Chess layout                                      | No scrollbar at 1280×800 viewport with 10+ moves and captures on both sides                      |

## Notes

- The backend migration for FEN/SAN is the highest-risk part of this spec. Recommend implementing and testing it
  independently before touching frontend display bugs.
- Existing chess sessions with non-FEN `board_state` values will need a migration or graceful fallback on resume.
