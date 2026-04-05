# Feature: Test Coverage Overhaul & CI/CD Redesign

**Status: ready**

## Background

The application is largely functional with 5 game engines (TTT, Chess, Checkers, Connect4, Dots-and-Boxes), auth
(local + Google OAuth), stats/leaderboard, and full React frontend. Current test coverage is uneven:

- **Covered**: TTT API flows, auth flows, navigation, SEO, smoke routes, some database tests, performance benchmarks
- **Not covered**: Python backend unit tests (game engines, game logic, auth service, persistence service), React
  component tests, most game E2E flows (only TTT), data correctness assertions, post-deploy verification

CI/CD has accumulated friction:

- Dependabot creates noisy PRs and has required workarounds (`pip-compile.yml` workflow) for Python dependency management
- No local pre-push validation -- problems are caught only after pushing to GitHub
- No post-deploy smoke tests -- Cloud Build deploys with no verification
- The `smoke-tests` CI job is monolithic (builds frontend, runs migrations, seeds data, runs multiple test suites)
- Git hooks exist in `scripts/pre-commit` but are not enforced or auto-installed

## Goals

1. Achieve comprehensive test coverage across all tiers of the testing pyramid, prioritizing the cheapest/fastest tier
   that can validate each behavior.
2. Restructure CI/CD so that failures surface as early and cheaply as possible (local > unit CI > integration CI > E2E
   CI > post-deploy).
3. Replace Dependabot version-update PRs with Renovate for better grouping, native pip-compile support, and finer
   auto-merge control. Keep GitHub Dependabot alerts for vulnerability scanning.
4. Add post-deploy smoke tests via GitHub Actions against the production Cloud Run URL.
5. Ensure all test infrastructure is containerized -- no requirement for local PostgreSQL installation.
6. Test data correctness (exact values, shapes, round-trips), not just "no error" assertions.

## Resolved Design Decisions

- **Vitest replaces Jest for frontend tests.** Vitest is the native test runner for Vite projects, shares the same
  config/transform pipeline, supports JSX/TSX natively, and is significantly faster. Jest remains only if a migration
  blocker is found.

- **`ENVIRONMENT` extended with `test` value.** The existing `ENVIRONMENT` env var (currently `development` or
  `production`) gains a third value: `test`. This is the single gate for all test-specific behaviors. No separate
  `AI_STRATEGY`, `TEST_MODE`, or similar env vars. The three environments map to real deployment contexts:
  - `development`: local dev via `docker compose up` -- hot reload, console telemetry, real AI
  - `test`: CI runners and `docker-compose.test.yml` -- deterministic AI (when `AI_MOVES` provided), skipped SSE
    stage delays, test seed data
  - `production`: Cloud Run -- real AI, real delays, GCP telemetry, strict security

- **Deterministic AI strategy for E2E game tests (per-request, not per-process).** A `DeterministicAIStrategy` class
  accepts a predetermined move list. It activates only when `ENVIRONMENT=test` and the request provides an AI move
  list (via `X-AI-Moves` header, comma-separated). Each test passes its own move sequence per request, so parallel
  tests with different move lists never collide. The full SSE pipeline, persistence, session management, and frontend
  rendering all execute normally -- only the move selection is fixed. The real AI's correctness is validated separately
  in Tier 1 unit tests. In `development` and `production` environments, the `X-AI-Moves` header is ignored entirely.

- **Pre-push hook via Husky with two-tier gate.** Husky auto-installs hooks on `npm install`, so every engineer gets
  them without manual setup. The pre-push hook runs a fast gate (lint, format, Vitest, pytest unit) without Docker.
  The full Docker-based integration suite is available via `npm run test:full` but is not required on every push --
  CI runs it regardless. This keeps push-time feedback under ~15 seconds while CI remains the hard gate.
  Bypassable with `--no-verify`.

- **Post-deploy smoke via GitHub Actions, triggered by Cloud Build `repository_dispatch`.** A final step in
  `cloudbuild.yaml` calls the GitHub API with a `repository_dispatch` event on successful deploy. The smoke workflow
  listens for this event and runs immediately. No Cloud Function or scheduled polling needed -- one `curl` step in
  Cloud Build, one GitHub PAT stored in GCP Secret Manager. Fires exactly once per deploy, within seconds.

- **Keep GCP Artifact Registry vulnerability scanning.** GitHub scans source dependencies (Python/JS packages). GCP
  scans the built container image (OS packages, system libraries, runtime binaries). These are complementary and cover
  different attack surfaces.

- **Renovate replaces Dependabot version PRs.** Renovate supports pip-compile natively (no separate workflow needed),
  has better grouping logic, a dashboard issue for visibility, and finer auto-merge control. Dependabot alerts remain
  enabled for passive vulnerability detection. Dependabot config is removed first; Renovate is added after. Manual
  upgrades cover the gap if needed for security issues.

- **Coverage thresholds deferred.** Coverage is measured by coverage.py (Python, via pytest-cov) and v8 (Vitest,
  built into the V8 engine). Both output lcov format for Codecov aggregation. No minimum thresholds enforced initially.
  After Phases 1-3 establish a baseline, thresholds will be set based on observed coverage rather than arbitrary targets.

- **E2E browser matrix: Chromium on PR, full matrix nightly.** E2E tests run Chromium-only on every PR (~3 min). A
  nightly scheduled workflow runs all three browsers (Chromium, Firefox, WebKit) against main. Estimated ~815 min/month
  at ~25-30 PRs/week (with ~40% spec-only PRs skipped by change detection), well within 2,000 free tier.

- **Shared seed data for integration tests.** Integration tests reuse `scripts/seed_test_data.py` rather than
  maintaining separate fixtures. Additional seed records are added to cover integration-specific scenarios. Single
  source of truth makes maintenance simpler.

- **Single Cloud Run instance (no staging).** All testing runs in GitHub Actions against a local server (Playwright's
  `webServer` config starts uvicorn on localhost:8000 as a subprocess). No Cloud Run instance is needed for any test
  tier. Cloud Build owns deployment only. A staging instance can be added later if "works locally, breaks in Cloud Run"
  issues emerge, but the main divergence points (Cloud SQL sockets, env var config) are already covered by the health
  endpoint and post-deploy smoke tests.

- **Linear ownership model:**
  1. GitHub Actions owns all testing (unit, integration, API, E2E) against localhost + PG service container
  2. Cloud Build owns deployment to the single prod Cloud Run instance
  3. Cloud Build pings GitHub via `repository_dispatch` on success
  4. GitHub Actions owns post-deploy smoke against prod URL
  5. All pass/fail visibility lives in GitHub Actions -- no need to monitor two systems

- **FastAPI `TestClient` replaces Playwright for API-only tests.** FastAPI's built-in `TestClient` (httpx-based) runs
  the app in-process without starting a real server. API tests become standard pytest functions instead of Playwright
  specs, running ~10x faster. Playwright is reserved exclusively for tests that need a real browser (E2E game flows,
  navigation, visual rendering).

- **MSW (Mock Service Worker) for frontend API mocking.** Frontend unit tests use MSW to intercept `fetch()` calls at
  the network level. This tests the actual API client code (`src/frontend/src/api/*.ts`) rather than mocking modules.
  MSW is the only mocking tool used for frontend API calls -- no `vi.mock()` for API modules.

- **`respx` for backend outbound HTTP mocking.** The Google OAuth callback (`auth.py`) makes outbound `httpx` calls to
  Google's token and userinfo endpoints. `respx` mocks these in integration tests so tests never hit real Google
  servers.

- **Frontend tests co-located with source files.** Vitest test files live next to the source they test (e.g.,
  `Navbar.test.tsx` next to `Navbar.tsx`). This is the standard Vite/Vitest convention and requires zero path
  configuration.

- **Stats cache cleared between tests, cache-dependent tests run serially.** A `clear_caches()` function in `stats.py`
  resets `_stats_cache` and `_leaderboard_cache`, callable only when `ENVIRONMENT == "test"`. Integration tests call
  this via a pytest fixture before each test. Tests that depend on cache behavior are marked with
  `@pytest.mark.serial` and run sequentially.

---

## Phase 1: Backend Unit Tests (Tier 1 - pytest)

Pure logic tests with no database or network dependency. Fastest tier.

### Scope

All files under `src/backend/game_engine/` and `src/backend/game_logic/`:

| Module | Test file | What to test |
|--------|-----------|-------------|
| `ttt_engine.py` | `tests/unit/test_ttt_engine.py` | `validate_move`, `apply_move`, `is_terminal`, `get_legal_moves`, `initial_state`, AI strategy move legality |
| `chess_engine.py` | `tests/unit/test_chess_engine.py` | Same interface methods, castling rules, en passant, promotion, check/checkmate detection |
| `checkers_engine.py` | `tests/unit/test_checkers_engine.py` | Same interface methods, mandatory jumps, king promotion, multi-jump chains |
| `connect4_engine.py` | `tests/unit/test_connect4_engine.py` | Same interface methods, column full detection, vertical/horizontal/diagonal wins |
| `dab_engine.py` | `tests/unit/test_dab_engine.py` | Same interface methods, box completion, score tracking, edge ownership |
| `tic_tac_toe.py` | `tests/unit/test_ttt_logic.py` | Game rules, win detection, draw detection |
| `chess.py` | `tests/unit/test_chess_logic.py` | Move generation, piece movement rules, board evaluation |
| `checkers.py` | `tests/unit/test_checkers_logic.py` | Move rules, jump logic, king behavior |
| `connect4.py` | `tests/unit/test_connect4_logic.py` | Drop mechanics, win scanning |
| `dots_and_boxes.py` | `tests/unit/test_dab_logic.py` | Line placement, box completion detection |
| `auth_service.py` | `tests/unit/test_auth_service.py` | `hash_password` / `verify_password` only (all other methods require DB -- tested in integration tier) |
| `models.py` | `tests/unit/test_models.py` | Pydantic model validation, serialization, rejection of invalid inputs |

### DeterministicAIStrategy

```python
# src/backend/game_engine/base.py

class DeterministicAIStrategy(AIStrategy):
    """Test-only AI that plays predetermined moves in order."""

    def __init__(self, moves: list[str]):
        self._moves = list(moves)
        self._index = 0

    def generate_move(self, state: dict) -> str:
        if self._index >= len(self._moves):
            raise ValueError("DeterministicAIStrategy exhausted its move list")
        move = self._moves[self._index]
        self._index += 1
        return move
```

Activation: game route handlers (in `games.py`) check `ENVIRONMENT == "test"` at the point where the AI strategy is
passed to `MoveProcessor.process_ai_turn()`. If in test mode and the request includes an `X-AI-Moves` header, a
`DeterministicAIStrategy` is created for that request with the provided move list. The module-level singleton
strategies (`_ttt_strategy`, etc.) remain unchanged -- they are simply not used for that request. In `development`
and `production`, the `X-AI-Moves` header is ignored and the singleton strategy is always used.

```python
# In each game's /move or /stream route handler:
strategy = _ttt_strategy  # default singleton
if os.getenv("ENVIRONMENT") == "test":
    ai_moves = request.headers.get("X-AI-Moves")
    if ai_moves:
        strategy = DeterministicAIStrategy(ai_moves.split(","))

ai_state, engine_eval = _ttt_processor.process_ai_turn(_ttt_engine, strategy, player_state)
```

When `ENVIRONMENT=test`, the SSE route handlers also skip artificial "thinking" stage delays. The explicit
`asyncio.sleep()` calls in checkers (2.5s init, 0.5s between multi-captures) and dots-and-boxes (0.5s between AI
moves) are reduced to ~50ms. The `StatusBroadcaster.MIN_INTERVAL` (2.5s rate limit) is also reduced to ~50ms.
Stages still fire as SSE events so the frontend pipeline is fully exercised, but without the wait. This reduces a
typical game E2E test from ~15-20 seconds to under 2 seconds.

Any future test-specific behavior should be gated on `ENVIRONMENT == "test"` and documented here with a clear reason
why it is needed for automated testing. Do not add behaviors to the `test` gate that are about convenience or
debugging -- those belong in `development`.

### Data correctness principle

Every test that touches game state asserts exact values, not just types or "no error":

```python
def test_ttt_apply_move_sets_correct_cell():
    engine = TicTacToeEngine()
    state = engine.initial_state()
    new_state = engine.apply_move(state, "4", player="X")
    assert new_state["cells"][1][1] == "X"
    assert sum(cell != "" for row in new_state["cells"] for cell in row) == 1
```

---

## Phase 2: Integration Tests (Tier 2 - pytest + PostgreSQL container)

Tests that require a real database. Run in Docker locally and in CI via service containers.

### Scope

| Test file | What to test |
|-----------|-------------|
| `tests/integration/test_persistence.py` | `create_game`, `get_active_game`, `record_move`, `close_game` -- insert known state, read back, assert exact JSONB values |
| `tests/integration/test_game_roundtrip.py` | For each game type: serialize board state to JSONB, read back, verify exact cell/piece positions |
| `tests/integration/test_auth_sessions.py` | Session creation, lookup, expiry, cleanup -- verify exact timestamps and user associations |
| `tests/integration/test_auth_service.py` | `create_user`, `find_user_by_email`, `find_user_by_username`, `create_session`, `get_user_by_session`, `delete_session` -- all DB-dependent auth operations |
| `tests/integration/test_stats_queries.py` | Insert known game results, query stats, assert exact counts/percentages/averages. Verify cache clearing between tests |
| `tests/integration/test_about_stats.py` | `/api/about/stats` returns correct aggregates for seeded data (games played, AI win rate, unique players) |
| `tests/integration/test_google_oauth.py` | Google OAuth callback with mocked Google responses via `respx` -- token exchange, user creation, session setup |
| `tests/integration/test_migrations.py` | Run `upgrade head`, verify schema matches expectations. Run `downgrade -1` then `upgrade head`, verify idempotency |
| `tests/integration/test_constraints.py` | One active game per user constraint, unique email/username, foreign key integrity |

### pytest configuration

New files required:

| File | Purpose |
|------|---------|
| `pyproject.toml` `[tool.pytest.ini_options]` | asyncio_mode = "auto", testpaths, markers (`serial` for cache-dependent tests) |
| `tests/conftest.py` | Root conftest with async DB session fixture, `TestClient` fixture, cache-clearing fixture, `seed_data` fixture |
| `tests/integration/conftest.py` | Integration-specific fixtures: DB setup/teardown, migration runner |
| `requirements-test.txt` | Test-only Python dependencies: pytest, pytest-asyncio, pytest-cov, respx, httpx |

### Docker Compose for Testing

```yaml
# docker-compose.test.yml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: test_db
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    tmpfs:
      - /var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test"]
      interval: 2s
      timeout: 5s
      retries: 5

  unit-tests:
    build:
      context: .
      target: test-runner
    command: >
      bash -c "
        python -m pytest tests/unit/ -x --tb=short &&
        npx vitest run --reporter=verbose
      "
    depends_on: []

  integration-tests:
    build:
      context: .
      target: test-runner
    environment:
      ENVIRONMENT: test
      DB_HOST: db
      DB_PORT: 5432
      DB_NAME: test_db
      DB_USER: test
      DB_PASSWORD: test
    command: >
      bash -c "
        python -m alembic upgrade head &&
        python scripts/seed_test_data.py &&
        python -m pytest tests/integration/ -x --tb=short
      "
    depends_on:
      db:
        condition: service_healthy
```

A `test-runner` stage will be added to the Dockerfile. The production image only has Python (Node is discarded after
the frontend build). The test-runner stage needs both runtimes plus test dependencies:

```dockerfile
FROM python:3.11-slim AS test-runner
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs
COPY requirements.txt requirements-test.txt ./
RUN pip install -r requirements.txt -r requirements-test.txt
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
```

This stage is only used by `docker-compose.test.yml` for local and CI testing. It is never deployed.

### Test data

Integration tests reuse `scripts/seed_test_data.py` as the shared seed. Additional records are added to the seed
script to cover integration-specific scenarios (e.g., completed games with known outcomes for stats verification,
expired sessions for cleanup testing). This keeps a single source of truth for test data.

Board state fixtures for round-trip testing live in `tests/fixtures/`:

```
tests/fixtures/
  ttt_states.json          # Known TTT board states (empty, mid-game, X-wins, O-wins, draw)
  chess_states.json         # Known chess positions (opening, middlegame, checkmate, stalemate)
  checkers_states.json      # Known checkers positions
  connect4_states.json      # Known Connect4 states (mid-game, vertical win, diagonal win, full board)
  dab_states.json           # Known Dots-and-Boxes states
```

Each fixture includes the expected query results so tests can assert exact values:
```python
fixture = load_fixture("ttt_states.json")["x_wins_diagonal"]
await persistence.create_game(user_id=1, game_type="tic-tac-toe", board_state=fixture["board"])
game = await persistence.get_active_game(user_id=1, game_type="tic-tac-toe")
assert game.board_state == fixture["board"]
assert game.board_state["cells"][0][0] == "X"
assert game.board_state["cells"][1][1] == "X"
assert game.board_state["cells"][2][2] == "X"
```

---

## Phase 3: Frontend Unit Tests (Tier 1 - Vitest + React Testing Library)

### Migration: Jest to Vitest

1. Add dev dependencies:
   - `vitest`, `@vitest/coverage-v8` -- test runner and coverage
   - `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` -- component testing
   - `jsdom` -- browser environment for component tests
   - `msw` -- API mocking at the network level
2. Add vitest config to `vite.config.ts`:
   ```ts
   test: {
     environment: 'jsdom',
     setupFiles: ['./src/frontend/src/test-setup.ts'],
     coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
   }
   ```
3. Create `src/frontend/src/test-setup.ts` with MSW server setup and `@testing-library/jest-dom` matchers.
4. Create `src/frontend/src/mocks/handlers.ts` with MSW request handlers for all API endpoints.
5. Migrate `tests/unit/smoke.test.js` to Vitest syntax (minimal changes -- Vitest is Jest-compatible).
6. Remove Jest dependencies (`jest`, `@types/jest`) and `jest.config.js`.
7. Update `package.json` scripts: `test:unit` points to `vitest run`, `test:unit:coverage` points to
   `vitest run --coverage`.

### Scope

Test files are co-located with source files (standard Vitest/Vite convention):

| Test file | What to test |
|-----------|-------------|
| `src/frontend/src/components/Navbar.test.tsx` | Renders nav links, highlights active route, mobile menu toggle |
| `src/frontend/src/components/Footer.test.tsx` | Renders footer links, copyright text |
| `src/frontend/src/components/AuthModal.test.tsx` | Login form validation, register form validation, form submission calls login API, error display |
| `src/frontend/src/components/ErrorBoundary.test.tsx` | Catches errors, renders fallback UI, recovery button |
| `src/frontend/src/components/games/GameStartOverlay.test.tsx` | Displays game options, calls correct callbacks |
| `src/frontend/src/components/games/GameStatsPanel.test.tsx` | Renders stats from props, handles zero/null values |
| `src/frontend/src/components/games/TicTacToeBoard.test.tsx` | Click on cell calls move handler with correct position, occupied cells are not clickable |
| `src/frontend/src/components/games/ChessBoard.test.tsx` | Click on piece highlights legal moves, click on target square calls move handler |
| `src/frontend/src/components/games/CheckersBoard.test.tsx` | Click on piece shows valid moves, jump moves remove captured piece from display |
| `src/frontend/src/components/games/Connect4Board.test.tsx` | Click on column calls move handler with column index, full column is not clickable |
| `src/frontend/src/components/games/DotsAndBoxesBoard.test.tsx` | Click on edge calls move handler, completed box fills with player color |
| `src/frontend/src/components/PlayerCard.test.tsx` | Renders user data, handles missing fields |
| `src/frontend/src/pages/HomePage.test.tsx` | Renders game cards, links have correct hrefs to game pages |
| `src/frontend/src/pages/AboutPage.test.tsx` | Renders stats (MSW-mocked API), team section |
| `src/frontend/src/pages/LeaderboardPage.test.tsx` | Renders leaderboard table, pagination, filters |
| `src/frontend/src/pages/ProfilePage.test.tsx` | Renders user profile, stats display |
| `src/frontend/src/hooks/useAuth.test.ts` | Login/logout state transitions, session persistence |
| `src/frontend/src/hooks/useCountUp.test.ts` | Animation from 0 to target value |
| `src/frontend/src/store/notifications.test.ts` | Add/remove/clear notifications, deduplication |
| `src/frontend/src/api/auth.test.ts` | Correct fetch calls via MSW, error handling, response parsing |
| `src/frontend/src/api/games.test.ts` | Correct fetch calls via MSW, response parsing |

All API calls mocked with MSW (Mock Service Worker) at the network level. This tests the actual `fetch()` calls in
the API modules rather than mocking the modules themselves. Component tests use `@testing-library/react` `render()` +
`screen` queries + `userEvent` for interactions.

---

## Phase 4: API Tests (Tier 2.5 - FastAPI TestClient) & E2E Tests (Tier 4 - Playwright)

### API tests via FastAPI TestClient

Replaces existing Playwright-based API tests (`tests/api/*.spec.ts`) with pytest + FastAPI `TestClient`. Runs
in-process without starting a server, ~10x faster than Playwright API tests. Existing Playwright API test specs are
migrated to pytest equivalents and the originals removed.

| Test file | Endpoints tested |
|-----------|-----------------|
| `tests/api/test_ttt.py` | `/api/game/tic-tac-toe/resume`, `/newgame`, `/move`, `/stream` |
| `tests/api/test_chess.py` | `/api/game/chess/resume`, `/newgame`, `/move`, `/stream` |
| `tests/api/test_checkers.py` | `/api/game/checkers/resume`, `/newgame`, `/move`, `/stream` |
| `tests/api/test_connect4.py` | `/api/game/connect4/resume`, `/newgame`, `/move`, `/stream` |
| `tests/api/test_dab.py` | `/api/game/dots-and-boxes/resume`, `/newgame`, `/move`, `/stream` |
| `tests/api/test_stats.py` | `/api/stats/user`, `/api/stats/leaderboard` -- verify exact values against seeded data |
| `tests/api/test_auth.py` | `/api/auth/register`, `/login`, `/logout`, `/me`, `/csrf-token` |
| `tests/api/test_about.py` | `/api/about/stats` -- verify exact aggregate values |
| `tests/api/test_seo.py` | `/api/robots.txt`, `/api/sitemap.xml` |
| `tests/api/conftest.py` | `TestClient` fixture, authenticated client fixture, deterministic AI header helpers |

```python
# Example: tests/api/test_ttt.py
from fastapi.testclient import TestClient
from src.backend.app import app

def test_ttt_newgame_returns_empty_board(auth_client: TestClient):
    response = auth_client.post("/api/game/tic-tac-toe/newgame", json={"player_first": True})
    assert response.status_code == 200
    board = response.json()["board_state"]
    assert all(cell == "" for row in board["cells"] for cell in row)
```

Each game API test:
- Creates a new game, verifies initial board state matches `initial_state()` exactly
- Submits moves with `X-AI-Moves` header for deterministic AI, verifies board state updates cell-by-cell
- Completes a full game, verifies win/loss/draw recorded correctly
- Tests invalid move rejection with correct error shape
- Tests session resume with correct state restoration

### E2E game flow tests

Using deterministic AI mode, test full browser flows for each game:

| Test file | Scenarios |
|-----------|----------|
| `tests/e2e/chess.spec.ts` | Start game, make moves, verify board renders pieces correctly, complete scholar's mate |
| `tests/e2e/checkers.spec.ts` | Start game, make moves + jumps, verify captures remove pieces from board |
| `tests/e2e/connect4.spec.ts` | Start game, drop pieces, verify column stacking, complete vertical win |
| `tests/e2e/dab.spec.ts` | Start game, draw lines, verify box completion and score update |
| `tests/e2e/leaderboard.spec.ts` | Verify leaderboard displays correct data, pagination works, filters apply |
| `tests/e2e/profile.spec.ts` | Verify profile shows correct stats for logged-in user |

---

## Phase 5: CI/CD Restructure

### GitHub Actions Redesign

Replace the current `tests.yml` with a multi-job pipeline. All jobs use GitHub Actions service containers for
PostgreSQL where needed -- no local Postgres required.

```yaml
# .github/workflows/ci.yml
jobs:
  changes:
    # Detect which files changed to skip irrelevant jobs
    outputs:
      backend: ${{ steps.filter.outputs.backend }}
      frontend: ${{ steps.filter.outputs.frontend }}
      ci: ${{ steps.filter.outputs.ci }}

  code-quality:
    # Lint, format, pydocstyle, npm audit
    # ~30s, no dependencies

  python-unit:
    needs: [changes]
    if: needs.changes.outputs.backend == 'true'
    # pytest tests/unit/ -- pure logic, no DB
    # ~15s

  frontend-unit:
    needs: [changes]
    if: needs.changes.outputs.frontend == 'true'
    # vitest run
    # ~20s

  integration:
    needs: [changes, python-unit]
    if: needs.changes.outputs.backend == 'true'
    # pytest tests/integration/ + tests/api/ with PG service container
    # Uses FastAPI TestClient (in-process, no server startup)
    # ~60s

  e2e-tests:
    needs: [changes, code-quality]
    # Build frontend, start server, run Playwright E2E tests (Chromium only)
    # ~3min

  security:
    # CodeQL + pip-audit + npm audit
    # Replaces separate codeql.yml (merge into single workflow)

  test-summary:
    needs: [code-quality, python-unit, frontend-unit, integration, e2e-tests, security]
    if: always()
    # Summary table
```

### Nightly Cross-Browser E2E

```yaml
# .github/workflows/nightly-e2e.yml
name: Nightly Cross-Browser E2E
on:
  schedule:
    - cron: '17 6 * * *'  # 6:17 AM UTC daily
  workflow_dispatch:

jobs:
  e2e:
    strategy:
      matrix:
        browser: [chromium, firefox, webkit]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - uses: actions/setup-python@v5
      - run: npm ci && npm run build
      - run: npx playwright install ${{ matrix.browser }}
      - run: npx playwright test tests/e2e/ --project=${{ matrix.browser }}
```

Key changes from current setup:
- `python-unit` and `frontend-unit` run in parallel with no DB, surfacing failures in ~20s
- `integration` only runs after `python-unit` passes (fail fast); includes API tests via FastAPI TestClient
- `e2e-tests` is the only job that needs a running server and browser
- `changes` job skips irrelevant test suites (backend-only change skips frontend tests)
- `security` consolidates CodeQL + dependency auditing

### Post-Deploy Smoke Tests

Triggered by Cloud Build on successful deploy via `repository_dispatch`. A final step in `cloudbuild.yaml` calls the
GitHub API. Also supports manual dispatch.

```yaml
# .github/workflows/post-deploy.yml
name: Post-Deploy Smoke
on:
  repository_dispatch:
    types: [deploy-success]
  workflow_dispatch:
    inputs:
      environment_url:
        default: 'https://game-ai-website-w4453qrbcq-uc.a.run.app'

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npx playwright install chromium
      - run: npx playwright test tests/smoke/ --project=chromium
        env:
          BASE_URL: ${{ github.event.client_payload.url || inputs.environment_url || 'https://game-ai-website-w4453qrbcq-uc.a.run.app' }}
```

Cloud Build addition (final step in `cloudbuild.yaml`):

```yaml
- name: 'gcr.io/cloud-builders/curl'
  entrypoint: 'bash'
  args:
    - '-c'
    - |
      curl -X POST \
        -H "Accept: application/vnd.github+json" \
        -H "Authorization: Bearer $$GITHUB_PAT" \
        https://api.github.com/repos/LemonHound/ai-game-project/dispatches \
        -d '{"event_type":"deploy-success","client_payload":{"url":"${_PROD_URL}","sha":"$SHORT_SHA"}}'
  secretEnv: ['GITHUB_PAT']

availableSecrets:
  secretManager:
    - versionName: projects/${_PROJECT_ID}/secrets/github-pat/versions/latest
      env: 'GITHUB_PAT'
```

Requires a GitHub PAT (fine-grained, `contents: write` scope on the repo) stored in GCP Secret Manager as
`github-pat`.

### Pre-Push Hook (Husky)

```json
// package.json additions
{
  "devDependencies": {
    "husky": "^9"
  },
  "scripts": {
    "prepare": "husky",
    "test:fast": "npx vitest run && python -m pytest tests/unit/ -x --tb=short && npm run lint && npm run format:check",
    "test:full": "docker compose -f docker-compose.test.yml up --build --abort-on-container-exit"
  }
}
```

```bash
# .husky/pre-push
npm run test:fast
```

The pre-push hook runs the fast gate (~15 seconds): Vitest, pytest unit tests, lint, and format check. No Docker
build, no database. This catches most issues immediately.

The full Docker-based suite (`npm run test:full`) is available for manual runs and always runs in CI. It includes
integration tests with a real PostgreSQL container. Engineers can run it before pushing if they want extra confidence,
but CI is the hard gate.

All engineers are on Windows with Docker Desktop and Git Bash. Husky auto-installs on `npm install`. Bypassable
with `--no-verify`.

---

## Phase 6: Dependency Management Overhaul

### Step 1: Remove Dependabot Version PRs

Delete `.github/dependabot.yml`. This removes all automated version-update PRs. GitHub Dependabot security alerts
remain active (they are a separate feature enabled at the repository level, not via this config file).

Delete `.github/workflows/dependabot-automerge.yml` and `.github/workflows/pip-compile.yml` (no longer needed).

Close any open Dependabot PRs.

In the gap between removing Dependabot and Renovate being active, manual `pip-compile --upgrade` and `npm outdated`
cover version updates. Security vulnerabilities are still surfaced by GitHub Dependabot alerts and can be addressed
with one-off manual upgrades.

### Step 2: Install Renovate

Add Renovate GitHub App to the repository. Configuration via `renovate.json` in repo root:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "schedule": ["before 9am on Monday"],
  "timezone": "America/New_York",
  "packageRules": [
    {
      "groupName": "npm minor/patch",
      "matchManagers": ["npm"],
      "matchUpdateTypes": ["minor", "patch"],
      "automerge": true,
      "automergeType": "pr",
      "platformAutomerge": true
    },
    {
      "groupName": "npm major",
      "matchManagers": ["npm"],
      "matchUpdateTypes": ["major"],
      "automerge": false,
      "assignees": ["LemonHound"]
    },
    {
      "groupName": "python dependencies",
      "matchManagers": ["pip-compile"],
      "automerge": false,
      "assignees": ["LemonHound"]
    },
    {
      "groupName": "github actions",
      "matchManagers": ["github-actions"],
      "automerge": true,
      "automergeType": "pr",
      "platformAutomerge": true
    }
  ],
  "pip-compile": {
    "fileMatch": ["requirements\\.in$"]
  },
  "vulnerabilityAlerts": {
    "enabled": true
  }
}
```

Renovate handles pip-compile natively: it edits `requirements.in` and runs `pip-compile` to regenerate
`requirements.txt` in the same PR. No separate workflow needed.

### Security Scanning

| Layer | Tool | What it scans | Cost |
|-------|------|--------------|------|
| Source (JS) | `npm audit` in CI | npm packages against advisory DB | Free |
| Source (Python) | `pip-audit` in CI | PyPI packages against OSV/advisory DBs | Free |
| Source (all) | GitHub Dependabot alerts | Known CVEs in declared dependencies | Free |
| Container | GCP Artifact Registry scanning | OS packages, runtime, system libraries in built image | ~$0.26/scan |
| Code | CodeQL (in CI) | Static analysis for injection, XSS, etc. | Free for public repos |

### Add pip-audit to CI

```yaml
# In the security job
- run: pip install pip-audit
- run: pip-audit -r requirements.txt --desc on --fix --dry-run
```

### New dependencies

**Python test dependencies** (`requirements-test.txt`, not added to `requirements.in`):
- `pytest`
- `pytest-asyncio`
- `pytest-cov`
- `respx` (mock outbound httpx calls in Google OAuth tests)

**Node dev dependencies** (added to `package.json` devDependencies):
- `vitest`, `@vitest/coverage-v8` (replaces `jest`)
- `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`
- `jsdom`
- `msw` (Mock Service Worker)
- `husky`

**Removed**:
- `jest`, `@types/jest` (replaced by vitest)
- `jest.config.js` (replaced by vitest config in `vite.config.ts`)

---

## Phase 7: CLAUDE.md & Documentation Updates

### CLAUDE.md additions

Add to the "After Writing Code" or a new "Before Pushing Code" section:

```markdown
## Before Pushing Code

1. Run the local test suite: `docker compose -f docker-compose.test.yml up --build --abort-on-container-exit`
2. All unit tests (Python + Vitest) and integration tests must pass before pushing.
3. If adding a new game engine or modifying game logic, verify that the corresponding unit tests in `tests/unit/` pass.
4. If modifying API endpoints, verify that the corresponding API tests in `tests/api/` pass locally by starting the
   server and running `npx playwright test tests/api/`.
```

### Test README

Update `tests/README.md` with the tier structure, how to run each tier, and how to add new tests.

---

## Test Cases

### Unit (pytest)

| Test name | Scenario |
|-----------|----------|
| `test_ttt_initial_state_is_empty_3x3` | TTT engine returns 3x3 grid of empty strings |
| `test_ttt_validate_move_rejects_occupied` | Placing on occupied cell raises validation error |
| `test_ttt_apply_move_sets_correct_cell` | Move "4" sets cells[1][1] to player marker |
| `test_ttt_is_terminal_detects_row_win` | Three in a row detected as terminal |
| `test_ttt_is_terminal_detects_draw` | Full board with no winner detected as draw |
| `test_ttt_ai_returns_legal_move` | AI strategy returns a move in `get_legal_moves()` |
| `test_chess_initial_state_has_32_pieces` | Chess engine initial state has exactly 32 pieces |
| `test_chess_pawn_cannot_move_backward` | Pawn move backward rejected by validate_move |
| `test_chess_checkmate_is_terminal` | Known checkmate position detected as terminal |
| `test_checkers_mandatory_jump_enforced` | When jump available, non-jump move rejected |
| `test_checkers_king_promotion` | Piece reaching last row becomes king |
| `test_connect4_column_full_rejected` | Move to full column rejected |
| `test_connect4_vertical_win_detected` | Four vertical in a row detected |
| `test_connect4_diagonal_win_detected` | Four diagonal in a row detected |
| `test_dab_box_completion_awards_point` | Completing fourth side of box awards point to player |
| `test_dab_extra_turn_on_box_completion` | Completing a box grants another turn |
| `test_deterministic_ai_plays_preset_moves` | DeterministicAIStrategy returns moves in order |
| `test_deterministic_ai_raises_when_exhausted` | Raises ValueError when move list is consumed |
| `test_deterministic_ai_ignored_in_production` | With ENVIRONMENT=production, X-AI-Moves header is ignored and real AI strategy is used |
| `test_deterministic_ai_ignored_in_development` | With ENVIRONMENT=development, X-AI-Moves header is ignored and real AI strategy is used |
| `test_deterministic_ai_per_request_isolation` | Two requests with different X-AI-Moves get independent move sequences |
| `test_auth_password_hash_roundtrip` | Hash password then verify returns True |
| `test_auth_wrong_password_fails` | Verify with wrong password returns False |
| `test_pydantic_move_request_rejects_missing_fields` | MoveRequest without required fields raises ValidationError |
| `test_pydantic_move_request_accepts_valid` | MoveRequest with all fields succeeds |

### Unit (Vitest + React Testing Library + MSW)

| Test name | Scenario |
|-----------|----------|
| `renders navbar with all navigation links` | Navbar component renders Home, Games, About links with correct hrefs |
| `highlights active route in navbar` | Current route link has active class |
| `auth modal validates empty email` | Submitting empty email shows validation error |
| `auth modal calls login on submit` | Form submission triggers fetch to /api/auth/login via MSW |
| `error boundary renders fallback on error` | Component error displays fallback UI |
| `ttt board click calls move handler` | Click on empty cell calls onMove with correct position index |
| `ttt board occupied cell not clickable` | Click on occupied cell does not call onMove |
| `chess board click highlights legal moves` | Click on piece shows valid target squares |
| `chess board click target calls move handler` | Click on highlighted square calls onMove with from/to |
| `checkers board shows valid moves on piece click` | Click on piece highlights legal move targets |
| `connect4 board click calls move with column` | Click on column calls onMove with column index |
| `connect4 board full column not clickable` | Full column click does not call onMove |
| `dab board edge click calls move handler` | Click on edge calls onMove with edge coordinates |
| `game start overlay calls correct callback` | Selecting "player first" calls onStart with correct option |
| `useAuth returns user after login` | Hook returns user object after successful MSW-mocked login |
| `useCountUp animates from 0 to target` | Hook value reaches target after animation |
| `notification store adds and removes` | Add notification increases count, remove decreases |
| `notification store deduplicates` | Adding duplicate notification does not increase count |
| `game stats panel renders zero stats` | Component handles all-zero stats without errors |
| `leaderboard page renders table rows` | MSW-mocked leaderboard data renders correct number of rows |
| `home page game cards link to correct routes` | Each game card has correct href to /games/{game-type} |
| `auth api login sends correct request` | MSW verifies login fetch sends email/password to /api/auth/login |

### Integration (pytest + PostgreSQL)

| Test name | Scenario |
|-----------|----------|
| `test_create_game_persists_initial_state` | Created game has exact initial board state in JSONB |
| `test_record_move_updates_board_state` | After move, DB contains updated board with exact cell values |
| `test_game_roundtrip_ttt` | Write TTT state, read back, assert cell-by-cell equality |
| `test_game_roundtrip_chess` | Write chess state, read back, assert piece positions |
| `test_game_roundtrip_checkers` | Write checkers state, read back, assert piece positions |
| `test_game_roundtrip_connect4` | Write Connect4 state, read back, assert column contents |
| `test_game_roundtrip_dab` | Write DaB state, read back, assert line/box state |
| `test_one_active_game_constraint` | Second active game for same user/type raises IntegrityError |
| `test_unique_email_constraint` | Duplicate email registration raises IntegrityError |
| `test_session_expiry_cleanup` | Expired sessions removed by cleanup, active sessions preserved |
| `test_stats_query_exact_counts` | With 5 games seeded (3 wins, 1 loss, 1 draw), stats return exact values |
| `test_stats_cache_cleared_between_tests` | After clearing cache, fresh query returns updated values |
| `test_leaderboard_ordering` | Players ranked by win count descending, ties broken by win rate |
| `test_about_stats_returns_correct_aggregates` | /api/about/stats returns exact games played, AI win rate, unique players |
| `test_auth_create_user_persists` | Created user retrievable by email with correct fields |
| `test_auth_session_created_and_retrievable` | Created session returns correct user on lookup |
| `test_auth_delete_session_removes_access` | Deleted session no longer returns user |
| `test_google_oauth_creates_user` | With mocked Google responses (respx), callback creates user and session |
| `test_migration_upgrade_downgrade_upgrade` | Schema survives full downgrade and re-upgrade |

### API (pytest + FastAPI TestClient)

| Test name | Scenario |
|-----------|----------|
| `test_ttt_newgame_returns_empty_board` | POST /newgame returns 3x3 grid of empty strings |
| `test_ttt_move_with_deterministic_ai` | POST /move with X-AI-Moves header returns board with both player and AI moves |
| `test_ttt_invalid_move_returns_400` | POST /move to occupied cell returns 400 with error shape |
| `test_chess_newgame_returns_starting_position` | POST /newgame returns 64-square board with pieces in starting positions |
| `test_chess_move_updates_board` | POST /move with e2e4 + X-AI-Moves returns board with pawn moved |
| `test_chess_invalid_move_returns_400` | Moving pawn backward returns 400 with error shape |
| `test_checkers_newgame_returns_initial_board` | POST /newgame returns board with 12 pieces per side |
| `test_checkers_jump_removes_captured_piece` | POST /move with jump + X-AI-Moves returns board without jumped piece |
| `test_connect4_newgame_returns_empty_columns` | POST /newgame returns all-empty 7-column board |
| `test_connect4_move_stacks_correctly` | POST /move with column 3 places piece at bottom of column 3 |
| `test_dab_newgame_returns_empty_grid` | POST /newgame returns grid with no lines drawn |
| `test_dab_completing_box_awards_point` | Sequence of moves completing a box returns updated score |
| `test_stats_returns_correct_values` | GET /stats/user returns exact win/loss/draw counts matching seed |
| `test_leaderboard_pagination` | GET /leaderboard?page=2 returns second page with correct entries |
| `test_auth_register_login_logout_flow` | Register, login, /me returns user, logout, /me returns 401 |
| `test_seo_robots_txt` | GET /api/robots.txt returns valid robots.txt |
| `test_seo_sitemap_xml` | GET /api/sitemap.xml returns valid sitemap |

### E2E (Playwright -- browser required)

| Test name | Scenario |
|-----------|----------|
| `chess full game with deterministic AI` | Play through scholar's mate, verify checkmate displayed |
| `checkers full game with deterministic AI` | Play through game, verify captures animate correctly |
| `connect4 full game with deterministic AI` | Play through vertical win, verify winning pieces highlighted |
| `dab full game with deterministic AI` | Play through game, verify score updates and boxes fill |
| `leaderboard displays after game completion` | Complete a game, navigate to leaderboard, verify entry appears |
| `profile stats update after game` | Complete a game, navigate to profile, verify stats incremented |

### Post-Deploy Smoke

| Test name | Scenario |
|-----------|----------|
| `production health endpoint returns 200` | GET /api/health returns 200 with valid JSON |
| `production homepage loads` | GET / returns 200, contains expected title |
| `production game page loads` | GET /games/tic-tac-toe returns 200, contains game board markup |
| `production database connected` | Health endpoint reports DB connected |
| `production SSL valid` | HTTPS connection succeeds with valid certificate |

### Manual

| Test name | Scenario |
|-----------|----------|
| `Google OAuth login flow` | Login via Google, verify redirect chain, verify session created |
| `Mobile touch interactions` | Play TTT on mobile device, verify touch targets are large enough |
| `Cross-browser visual check` | Verify layout in Chrome, Firefox, Safari |

---

## Open Questions

None -- all design decisions resolved.

## Implementation Order

This spec is large. Implementation should be broken into multiple PRs, roughly one per phase:

1. Phase 1 (backend unit tests) + DeterministicAIStrategy + `ENVIRONMENT=test` gate + cache clearing -- can begin
   immediately, no infrastructure changes
2. Phase 3 (Vitest migration + MSW setup + component tests) -- can begin in parallel with Phase 1
3. Phase 2 (integration tests + conftest.py + docker-compose.test.yml + test-runner Dockerfile stage) -- depends on
   Phase 1 patterns
4. Phase 4 (FastAPI TestClient API tests + E2E expansion) -- depends on DeterministicAIStrategy from Phase 1
5. Phase 5 (CI restructure + Husky + post-deploy smoke) -- depends on Phases 1-4 being merged so new jobs have tests
   to run
6. Phase 6 (Renovate + dependency overhaul) -- independent, can happen anytime
7. Phase 7 (docs) -- after all other phases
