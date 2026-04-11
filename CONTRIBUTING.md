# Contributing to AI Game Hub

This guide covers **how we develop and document** the project (specs, ADRs, tests, GitHub workflow) and **practical
how-to** for running the app, extending game AI, reading database fields, and validating changes. Use the sections you
need; maintainers and reviewers should skim **Development workflow** and **Branch hygiene** at least once.

For **Cursor** and other coding agents, see **[AGENTS.md](AGENTS.md)** and the rules under **`.cursor/rules/`** — they
repeat only what must stay top-of-mind in each turn; this file remains the full reference.

---

## Development workflow (spec-driven)

Non-trivial work is **spec-first**, not “code first, document later.”

1. Create a folder **`features/<short-name>/`** (kebab-case or similar, match existing features).
2. Add **`spec.md`**. Use it to capture problem statement, design, API or UI touchpoints, data model impacts, rollout,
   and edge cases.
3. **Design** (conversation or review): refine the approach against the spec until the team agrees.
4. **Update `spec.md`** with the final design before or while implementing. The spec must include a **Test Cases**
   section listing **every** new scenario with:
    - **Tier:** unit (Python), unit (frontend), integration, API, E2E, or manual
    - **Concrete test name** (or checklist item for manual)
    - **Scenario** (what is being proved)
5. **Implement** against the finalized spec. A feature is **not complete** until all **automated** test cases listed in
   the spec pass in CI and any **manual** cases are documented in a manual checklist in the same spec (or linked from
   it).

**Planning vs implementation:** If it is unclear whether work is still in the design/spec phase or in implementation,
clarify before writing large amounts of code. Planning finishes steps 1–4; implementation is step 5.

**Refactors and broad cleanups** should also go through **`features/<name>/spec.md`** unless the change is trivial and
fully localized (single obvious bug fix).

---

## Bugs, regressions, and GitHub issues

**Bug definition:** A bug is behavior that **contradicts documented intent** (feature **`spec.md`**, **`adr.md`**, or
this guide where we treat text as contract). If resolving the report needs **new infrastructure**, env contracts, or a
product/architecture decision, treat it as **feature work**: update or add a spec (and ADR if warranted), then
implement.

**Where bugs live:** Open a **GitHub Issue** with a short title, link to the doc section that defines correct behavior,
and steps or evidence to reproduce. Do **not** use the repo as a substitute for the issue tracker (no standalone
“bug.md” or similar in place of an issue). Bug fixes do **not** depend on merging some other PR first; the issue tracks
the defect independently.

**Regression tests:** The PR that fixes a bug should **add or extend automated tests** that fail on the old behavior and
pass on the fixed behavior, at the lowest tier that still catches the defect (pytest unit, TestClient API, integration,
Vitest, or Playwright). Prefer red-then-green locally when practical; CI must pass before merge.

**Live games:** A **live game** is any game route users can reach in production through the normal hub, including games
that ship **without** AI. Whenever a game becomes live, the same change (or an immediately follow-up PR) must extend
**smoke** route checks, **E2E** game-flow specs, and **API** tests to match that game’s contracts. **Current live
games:** Tic-tac-toe, Checkers, Chess, Connect4, Dots and Boxes. **Pong** is not live until its feature spec marks it
shipped and routes are enabled; then it joins this list.

**Full-product coverage:** Aim for tests that would catch any documented regression if the pyramid were complete.
`features/test-coverage-overhaul/spec.md` is the umbrella for CI tiers, TestClient vs Playwright, and long-term coverage
across the site. `features/test-audit-and-regression/spec.md` tracks the current audit and live-game E2E parity work.

---

## Architecture decision records (ADRs)

ADRs record **significant, long-lived** decisions so future contributors (and agents) do not reverse them by accident.

- **Default location:** **`features/<name>/adr.md`** next to the spec that motivated the decision.
- **When to add one:** New or changed **architecture** (e.g. transport choice, auth/session model, cross-game engine
  contracts), **operational** strategy (observability, deployment shape), or a **pattern other features must follow**.
  Routine bug fixes, small UI tweaks, or one-off CRUD usually **do not** need an ADR.
- **When unsure:** Prefer a **short** ADR over silent knowledge loss.
- **Cross-cutting decisions** that are not tied to one feature may live under **`docs/`** if the repository already uses
  that pattern; otherwise keep them with the feature that introduced the change.

Existing example: `features/game-tic-tac-toe/adr.md`.

---

## Branch hygiene, pull requests, and continuous integration

- Keep work **up to date** with the target branch (usually `main`) while coding.
- **Before pulling:** If your team uses shared branches or multiple open PRs, resolve **merge conflicts** on blocked PRs
  before integrating new upstream work, when applicable.
- **Before pushing:** `git fetch` and **rebase onto `origin/main`** (or merge, if that is your team convention).
- **Pull requests:** Open PRs as **draft** by default until ready for review (`gh pr create --draft`, when using GitHub
  CLI). Fix merge conflicts before requesting review.
- **Before push:** Run **`npm run test:fast`** locally (and any other relevant test tiers); it runs Prettier check,
  ESLint, Vitest, and pytest unit. Do not push to discover lint/format failures in CI. Avoid **`git push --no-verify`**
  unless you intentionally bypass the hook.
- **After opening or updating a PR:** Watch required checks until they finish, e.g. **`gh pr checks <number> --watch`**
  (unless you choose not to).
- **When submitting a PR for merge:** Prefer **`gh pr merge <number> --auto --squash`** so it merges when checks pass
  (unless auto-merge is inappropriate for that change).
- **CI:** The required GitHub Actions check is **Test Summary**. Fix failures before merging.
- **After merge:** GCP Cloud Build deploys to Cloud Run (typically a few minutes). You do not need to block every
  session on deploy completion; on a later hygiene pass you can verify with:
    - `gcloud builds list --limit=5 --region=global`
    - `gcloud run services describe game-ai-website --region=us-central1`  
      A **failed deploy** should be treated as high priority before starting unrelated new work.

---

## Python dependencies (pip-tools)

Python dependencies are locked with **pip-tools**.

- Edit **`requirements.in`** only (direct dependencies, no version pins unless you intend to pin).
- Regenerate the lockfile — **never edit `requirements.txt` by hand:**
    ```bash
    python -m piptools compile requirements.in --output-file requirements.txt --strip-extras --upgrade
    ```
- Commit **`requirements.in`** and **`requirements.txt`** together.

Transitive packages belong in the lockfile only, not in `requirements.in`. Renovate may update both in automated PRs.

---

## AI-assisted development (Cursor)

- **Project rules:** `.cursor/rules/*.mdc` — scoped instructions (always-on, glob-based, or attach manually with `@`).
- **Short agent defaults:** [AGENTS.md](AGENTS.md)
- **Full human workflow:** this document.

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

## 1e. Cursor agents and authentication (GitHub / GCP)

Remote or integrated **Cursor** sessions may use a shell where `gh` / `gcloud` are **not** logged in the same way as
your day-to-day terminal. If a command fails with **permission**, **401/403**, **Resource not accessible by
integration**, or **not authenticated**, do **not** ask the user to paste tokens into chat or commit secrets to the
repo.

**Ask the user** to perform authorization **on their Windows machine** so credentials land in the OS trust store (for
example **Windows Credential Manager** via normal GitHub CLI and Google Cloud flows):

- **GitHub / `gh`:** In **Cursor’s integrated terminal** (or any terminal on the PC), run `gh auth login` and complete
  the browser or device flow. That stores the session where `gh` expects it on Windows (Credential Manager / GitHub CLI
  config under `%AppData%`). Retry `gh pr view`, `gh pr edit`, or `gh api` after login. If `gh pr edit` fails with a
  **Projects (classic)** GraphQL deprecation error, use `gh api repos/<owner>/<repo>/pulls/<n> -X PATCH` with a JSON
  body as a workaround, or remove the PR from classic Projects.
- **GCP / `gcloud`:** Run `gcloud auth login` and, when tools need application default credentials,
  `gcloud auth application-default login`, again from a terminal on the user’s machine so ADC and tokens are stored
  locally.

After the user confirms they completed login, **re-run** the failing command. If the agent environment still cannot see
those credentials (common for **cloud-only** agents), say so clearly: the user may need to **configure Cursor’s GitHub
integration** or **Secrets** for that environment, not only local Windows auth.

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

You usually only need **fast** tests day to day; use integration/API/E2E when your change touches the database, HTTP
APIs, or full-browser flows.

### Tier reference

| Tier            | Runner                      | Location                                   | Requires DB                           |
| --------------- | --------------------------- | ------------------------------------------ | ------------------------------------- |
| Unit (Python)   | pytest                      | `tests/unit/`                              | No                                    |
| Unit (Frontend) | Vitest                      | `src/frontend/src/**/*.test.{ts,tsx}`      | No                                    |
| Integration     | pytest                      | `tests/integration/`                       | Yes (PostgreSQL on port 5433)         |
| API             | pytest + FastAPI TestClient | `tests/api_tests/`                         | Yes (PostgreSQL on port 5433)         |
| E2E             | Playwright                  | `tests/e2e/`, `tests/smoke/`, `tests/api/` | Yes (PostgreSQL on port 5432, server) |

**Nightly cross-browser E2E:** Any `*.spec.{js,ts}` file under the directories matched by `playwright.config.js` —
`tests/api/`, `tests/auth/`, `tests/database/`, `tests/e2e/`, `tests/games/`, `tests/performance/`, `tests/smoke/` — is
included automatically in the nightly cross-browser job (`.github/workflows/nightly-e2e.yml`). Adding a file under those
paths adds CI surface area; prefer colocating new Playwright specs there intentionally.

**Full suite (with Docker test DB):**

```bash
docker compose -f docker-compose.test.yml up -d
python -m pytest tests/ -x --tb=short
npx vitest run
docker compose -f docker-compose.test.yml down
```

**E2E (built frontend + running server):**

```bash
npm run build
npx playwright test --project=chromium
```

### Coverage policy

1. **Never delete or weaken a test** to fix a failure unless the test is objectively wrong (e.g. it encodes a bug as
   expected behavior). Prefer fixing code, fixtures, or test data.
2. **New surface area** needs tests at the appropriate tier: new endpoints → API tests; game engine methods → unit;
   components → Vitest; critical user flows → E2E when already covered by that style in the repo. **Live games** (see
   **Bugs, regressions, and GitHub issues** above) must gain matching smoke, E2E, and API coverage when they ship.
3. **Assertions should be precise** — specific counts, field values, board cells — not only “no exception” or type-only
   checks. See `features/test-coverage-overhaul/spec.md` for the data-correctness principle.
4. **New features** must list automated cases in the feature **`spec.md` Test Cases** section; see **Development
   workflow** above.
5. **Before pushing**, run the tier that matches your edit (`npm run test:fast`, or pytest subsets, or API tests with
   the test compose file).
6. **Removing a test** requires a commit-message explanation and either removed behavior or replacement coverage.

**Pre-push:** Husky runs `npm run test:fast` on `git push` (Vitest + pytest unit + lint + format check). You can bypass
with `--no-verify` when necessary; **CI remains the hard gate**.

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
