# Contributing to AI Game Hub

This guide is written for ML/AI engineers and data scientists who want to add AI logic, read game data, or run the
project locally. No frontend experience required.

---

## 1. Getting started

**Prerequisites:** Docker Desktop only. No Python or Node install needed.

Clone the repo and start everything:

```bash
git clone https://github.com/LemonHound/ai-game-project.git
cd ai-game-project
docker compose build
docker compose up
```

The backend API is available at `http://localhost:8000`. The frontend is served from the same origin. Log in with the
test credentials below:

| Username   | Password      | Notes                  |
| ---------- | ------------- | ---------------------- |
| `testuser` | `password123` | Standard local account |

---

## 2. Running locally

`docker compose up` starts the backend and database together. The backend hot-reloads when you edit files in
`src/backend/` — no restart needed.

If you pull frontend changes (anything in `src/frontend/`), rebuild the app container:

```bash
docker compose build app
docker compose up
```

The database is initialized by Alembic on first start. If you ever need to reset it:

```bash
docker compose down -v        # removes the postgres volume
docker compose up             # recreates tables via alembic upgrade head
```

---

## 3. Pre-submit setup (one-time per machine)

```bash
cp scripts/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

What the hook does before each commit:

1. `npm run format` — auto-formats TypeScript/CSS/HTML with Prettier (write mode)
2. `npm run lint` — runs ESLint + JSDoc checks on TypeScript
3. `pydocstyle src/backend/` — checks Google-style docstrings on Python

If the hook fails, fix the reported issue and re-run `git commit`. You can also run checks manually at any time — see
section 9.

---

## 4. Adding AI logic for a game

All game AI lives in `src/backend/game_logic/`. Each game has its own file (e.g. `tic_tac_toe.py`, `chess.py`). The file
exposes one class with two public methods: `get_initial_state` and `apply_move`.

For the SSE-based game engine layer (`src/backend/game_engine/`), each game also has an Engine class that subclasses
`GameEngine` (from `game_engine/base.py`) and an AI class that subclasses `AIStrategy`.

**To add or replace AI logic for an existing game:**

1. Open `src/backend/game_logic/<game>.py` (or `game_engine/<game>_engine.py` for SSE games)
2. Find the class that subclasses `AIStrategy`
3. Override `generate_move(state)` — it receives the full game state dict and must return `(move, eval_score)` where
   `eval_score` can be `None`

The game state shape is documented in section 5.

**Wiring a new strategy into the router:**

The router in `src/backend/games.py` instantiates the AI strategy at module level:

```python
_ttt_strategy = TicTacToeAIStrategy()
```

Replace with your new class and it will be used for all new moves immediately.

---

## 5. Reading game state and move history

Each game session is stored as a single row in `{game_type}_games` (e.g. `chess_games`).

| Field                                                  | Type    | Description                                                             |
| ------------------------------------------------------ | ------- | ----------------------------------------------------------------------- |
| `id`                                                   | UUID    | Session identifier — also used as SSE stream key                        |
| `board_state`                                          | JSONB   | Full board state after the last move. Shape varies by game (see below). |
| `move_list`                                            | TEXT[]  | All moves in standard notation, oldest first. Used for ML training.     |
| `game_ended`                                           | boolean | True when the game is over (any outcome)                                |
| `player_won` / `ai_won` / `is_draw` / `game_abandoned` | boolean | Outcome flags                                                           |

**board_state shape by game:**

- **Tic-Tac-Toe**:
  `{"board": [null|"X"|"O", ...] (9 elements), "status": "in_progress"|"complete", "winner": null|"X"|"O"|"draw"}`
- **Connect 4**: `{"board": [[null|"player"|"ai", ...] x 6] (7 cols), "game_active": bool, "move_count": int}`
- **Checkers**:
  `{"board": ["_"|"R"|"r"|"B"|"b", ...] (64 elements), "current_turn": "player"|"ai", "legal_pieces": [int, ...]}`
- **Dots and Boxes**:
  `{"grid_size": 4, "horizontal_lines": {"r,c": "player"|"ai"}, "vertical_lines": {...}, "boxes": {...}, "player_score": int, "ai_score": int}`
- **Chess**:
  `{"board": [[null|"P"|"p"|..., ...] x 8], "current_player": "white"|"black", "castling_rights": {...}, "en_passant_target": null|[row, col]}`

**move_list notation by game:**

- Tic-Tac-Toe: `"r{row}c{col}"` e.g. `"r1c2"`
- Connect 4: `"c{col}"` e.g. `"c3"`
- Checkers: algebraic from+to e.g. `"b6d4"`
- Dots and Boxes: `"h{r}{c}"` (horizontal) or `"v{r}{c}"` (vertical)
- Chess: UCI e.g. `"e2e4"`, `"e7e8q"` for promotion

---

## 6. Modifying the database

The schema is managed by Alembic. Use this workflow whenever you add or change a column:

1. Edit the model in `src/backend/db_models.py`
2. Generate a migration:
    ```bash
    docker compose exec app alembic revision --autogenerate -m "your description"
    ```
3. Apply it:
    ```bash
    docker compose exec app alembic upgrade head
    ```

All game tables share the same base structure (`GameRecord` in `db_models.py`). Adding a column to all game types means
adding it to `GameRecord`; adding a game-specific column means adding it to that game's concrete class (e.g.
`ChessGame`).

Do not edit the `user_sessions` or `users` tables without coordinating with the team.

---

## 7. Adding logging or telemetry

**Logging** — use the module-level logger, not print:

```python
import logging
logger = logging.getLogger(__name__)
logger.info("move recorded", extra={"game_id": str(game_id), "move": move_notation})
```

**Custom span** — wrap expensive operations in a child span:

```python
from opentelemetry import trace
tracer = trace.get_tracer(__name__)

with tracer.start_as_current_span("my_operation") as span:
    span.set_attribute("game.type", game_type)
    # ... your code
```

Spans appear in GCP Cloud Trace in production and on stdout locally.

---

## 8. Writing docstrings

All public Python functions use Google-style docstrings. All exported TypeScript functions and React components use
JSDoc.

**Python:**

```python
def my_function(game_type: str, count: int) -> list[str]:
    """Return a list of move notations for the given game type.

    Args:
        game_type: One of "chess", "tic_tac_toe", "checkers", "connect4", "dots_and_boxes".
        count: Number of moves to return.

    Returns:
        List of move notation strings.

    Raises:
        KeyError: If game_type is not recognized.
    """
```

**TypeScript:**

```typescript
/**
 * Fetch the active game session for the current user.
 *
 * @param gameType - The game type identifier (e.g. "chess").
 * @returns The active session, or null if none exists.
 * @throws {GameApiError} If the request fails.
 */
export async function getActiveGame(gameType: string): Promise<GameSession | null> {
```

---

## 9. Checking your work

Run all checks manually before committing:

```bash
npm run format:check    # Prettier — fails if files are not formatted
npm run lint:check      # ESLint + JSDoc — fails on missing docstrings or lint errors
pydocstyle src/backend/ # Google-style docstring presence on Python
```

**Common failures:**

| Message                                                 | Fix                                                    |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `pydocstyle: D100 Missing docstring in public module`   | Add a one-line module docstring at the top of the file |
| `pydocstyle: D103 Missing docstring in public function` | Add a Google-style docstring to the function           |
| `jsdoc/require-jsdoc: Missing JSDoc comment`            | Add a `/** ... */` comment above the exported function |
| `Prettier: ... was not formatted`                       | Run `npm run format` to auto-fix                       |
