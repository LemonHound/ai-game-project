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

The backend API is available at `http://localhost:8000`. The frontend is served from the same origin. Log in with any of
the seeded test accounts:

| Email                 | Password      |
| --------------------- | ------------- |
| `test@example.com`    | `password123` |
| `demo@aigamehub.com`  | `password123` |
| `player1@example.com` | `password123` |

---

## 1b. Working on an open pull request

If the task is to **review, amend, or extend** work that already has a PR, check out that PR’s branch before editing so
commits push to the correct remote branch:

```bash
gh pr checkout <number>
```

Inspecting a PR with `gh pr view` or `gh pr diff` while staying on `main` does not switch branches; without an explicit
checkout, local commits would not update the PR.

---

## 1c. Pull request descriptions during review

Treat the GitHub PR **title** and **body** as part of the deliverable, not optional prose.

Whenever review discussion **narrows scope**, **adds scope**, or **locks a decision** (product, data shape, timing,
cross-game behavior), update the PR before or with the next push so reviewers and CI see the same story as the branch:

- **Title:** still accurate for what will merge (edit if the PR shifted from the original headline).
- **Body:** Summary matches the final change set; “decisions made” and any trade-offs called out explicitly; test plan
  and dependency notes (e.g. “merge after X”) stay current. Link relevant **`features/*/adr.md`** files when the PR
  implements or supersedes an architectural decision.

Use the GitHub CLI from the PR branch, for example:

```bash
gh pr edit <number> --title "type: concise subject"
gh pr edit <number> --body-file path/to/pr-body.md
```

If you only need a small fix, `gh pr edit <number> --body "..."` is fine. Do not leave stale review questions in the
body once they are answered; replace them with the agreed outcome.

---

## 1d. Architecture Decision Records (ADRs)

**Decisions belong in ADRs, not only in chat or PR comments.** If work encodes a **significant, long-lived**
architectural or product decision (new persistence contract, SSE/event cadence rules, cross-game env semantics,
auth/session boundary, observability strategy, or any pattern other features must copy), add or update
**`features/<feature-name>/adr.md`** alongside that feature’s `spec.md`. Co-locate the ADR with the feature that owns
the change unless the team already keeps cross-cutting ADRs under `docs/`.

Workflow:

1. When a decision is made during design or review, **stop and ask** whether it meets the bar above.
2. If yes, **write the ADR** (status, context, decision, consequences) in the same PR as the spec or implementation that
   carries it out.
3. Link the ADR from the feature `spec.md` if readers would otherwise miss it.

Small or reversible changes do not need an ADR; **routine** fixes stay in `spec.md` **Test Cases** only. When in doubt,
prefer a **short ADR** over losing the rationale in a closed PR thread.

---

## 2. Running locally

`docker compose up` starts the backend and database together. The backend hot-reloads when you edit files in
`src/backend/` — no restart needed.

If you pull frontend changes (anything in `src/frontend/`), rebuild the app container:

```bash
docker compose build app
docker compose up
```

On every start, the container automatically runs migrations and seeds the test accounts above — no manual steps needed.
If you ever need to reset to a clean state:

```bash
docker compose down -v        # removes the postgres volume
docker compose up             # recreates schema and re-seeds test accounts
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

**Chess model integration:**

Chess has a dedicated scaffold for plugging in an external ML model. See section 10 for the short version, or
[`src/backend/game_engine/INSTRUCTIONS.txt`](src/backend/game_engine/INSTRUCTIONS.txt) for the full walkthrough.

**How AI move generation works (all games):**

The `MoveProcessor` in `game_engine/base.py` manages the AI turn loop:

1. Calls `strategy.generate_move(state)` to get a move candidate.
2. Validates the move with `engine.validate_move(state, move)`.
3. If invalid, retries up to 5 times with fresh `generate_move` calls.
4. After 5 failed attempts, falls back to a random move from `engine.get_legal_moves(state)`.

This means your `generate_move` does not have to guarantee a legal move — the framework handles retries and fallback
automatically. All retry attempts are logged as warnings so you can observe them in `docker compose logs -f app`.

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

## 9. Environment configuration

The app reads these environment variables. In local development they are set in `docker-compose.yml` under the `app`
service's `environment:` block.

| Variable            | Default                       | Description                                                                                                                                                          |
| ------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENVIRONMENT`       | `development`                 | Set to `test` in the test Docker Compose file. Affects SSE timing (fast mode for tests) and enables the `X-AI-Moves` test header. Never set to `test` in production. |
| `CHESS_AI_STRATEGY` | `minimax`                     | Set to `model` to activate `ChessModelStrategy` instead of the built-in minimax AI.                                                                                  |
| `CHESS_MODEL_PATH`  | `/app/model_weights/chess.pt` | Path inside the container where `ChessModelStrategy` looks for model weights. Override if your file is named differently.                                            |

To change a variable locally:

1. Edit the `environment:` section in `docker-compose.yml`.
2. Restart: `docker compose up -d`.

No rebuild is needed for environment variable changes.

---

## 10. Chess model integration (short version)

The scaffold for plugging in an external chess model lives in two files:

| File                                              | What to edit                                                 |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `src/backend/game_engine/chess_model_strategy.py` | Implement `_load_model(path)` and `_predict(pgn)`            |
| `docker-compose.yml`                              | Set `CHESS_AI_STRATEGY: model` and mount your weights volume |

`_load_model` is called once at startup. `_predict` is called once per AI turn and receives the full PGN of the game so
far; it must return a UCI move string (e.g. `"e2e4"`).

Everything else — PGN construction, UCI→engine move conversion, move validation retry, logging — is handled by the
framework. You do not need to touch any other file.

See [`src/backend/game_engine/INSTRUCTIONS.txt`](src/backend/game_engine/INSTRUCTIONS.txt) for the full walkthrough
including database access, dependency management, and how to mount model weights.

---

## 11. Running tests

There are four test tiers. You usually only need to run the first two.

**Fast tests (no Docker DB required):**

```bash
npm run test:fast
```

This runs Python unit tests (`tests/unit/`) and frontend Vitest tests in one command. No database needed. Run this after
any backend or frontend change.

**Integration and API tests (requires the test database):**

```bash
docker compose -f docker-compose.test.yml up -d
python -m pytest tests/integration/ tests/api_tests/ -x --tb=short
docker compose -f docker-compose.test.yml down
```

These tests hit a real PostgreSQL instance. Run them after changing API routes, database queries, or game engine logic.

**To run only chess-related tests:**

```bash
python -m pytest tests/unit/ -k chess -x --tb=short
python -m pytest tests/api_tests/ -k chess -x --tb=short
```

**How tests handle AI moves (deterministic testing):**

When `ENVIRONMENT=test`, every game API endpoint accepts an optional `X-AI-Moves` header — a comma-separated list of
moves. The server uses these predetermined moves instead of calling the real AI strategy. This makes tests reproducible
without a trained model.

Example (using `pytest` with the `TestClient`):

```python
response = client.post(
    "/api/game/tic-tac-toe/move",
    json={"position": 4},
    headers={"X-AI-Moves": "0,8"},
)
```

The `X-AI-Moves` header is ignored in `development` and `production` environments — it only works when
`ENVIRONMENT=test`.

**What this means for your model:**

When tests run, the server uses `DeterministicAIStrategy` (if `X-AI-Moves` is set) regardless of the `CHESS_AI_STRATEGY`
env var. Your model is never called during test runs, so it does not need to be available in the test environment.

---

## 12. Checking your work

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
