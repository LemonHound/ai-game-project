# Adding a New Feature

1. Each feature will be given a new folder in the /features/ folder (found in the root)
2. Each of these folders will have a spec.md file
3. Design conversation: reference CLAUDE.md + provided spec.md, refine the approach
4. Update spec.md with final design, create adr.md if significant changes to architecture will be made Each spec must
   include a **Test Cases** section listing every new scenario, which tier it belongs to (unit / API integration / E2E /
   manual), and the concrete test name. A feature is not considered complete until all automated test cases pass in CI
   and any manual cases are documented in the manual checklist.
5. Implementation conversation: reference CLAUDE.md + finalized spec.md

# Conversation Preferences

- Keep responses brief. Only provide explanations when requested.
- Never use emojis or comments in code unless explicitly requested.
- Write simple code, use best practice naming conventions.
- Check your work - after each response, review the response and note any potential mistakes or files that should be
  checked for consistency / conflicts.
- Provide suggestions for refactoring, simplification, or modernization. Unless otherwise directed, this should always
  be initiated through a new feature/folder and spec.md file.

# Stack

- Backend: FastAPI (Python 3.11+), PostgreSQL via psycopg2
- Frontend: React 18 + TypeScript, Vite, React Router v6, TanStack Query, Zustand, Tailwind CSS + DaisyUI
- Observability: OpenTelemetry — auto-instrumented FastAPI + psycopg2; GCP Cloud Trace + Cloud Monitoring in prod,
  console exporter locally
- Testing: Vitest (frontend unit), pytest (backend unit + integration + API), Playwright (E2E / smoke)
- CI/CD: GitHub Actions (CI tests) + GCP Cloud Build (build & deploy) → GCP Cloud Run (see Branch Hygiene)
- Secrets: GCP Secret Manager (never use .env in production)
- Logs: GCP Cloud Logging (stdout from Cloud Run, never use print())

# Branch Hygiene

- Whenever writing code, ensure that it is up to date with the target branch
- Whenever pulling code, check the following:
    1. Pull all open PRs - for any open PRs, check if they are blocked due to merge conflicts.
    2. If any PRs are blocked, resolve them immediately. If more than one is blocked in this way, go back to step 1 and
       repeat until all PRs are unblocked.
    3. If no PRs are blocked, wait until they are merged. This may involve replying to the conversation and requesting a
       prompt like 'continue' before reassessing.
    4. If there are no open PRs (e.g. nothing outstanding for main branch), proceed with the pull.
- Whenever pushing code:
    1. Fetch and rebase onto `origin/main`.
    2. Scan for open PRs. If any are open, resolve them first.
    3. Push the code.
    4. Open a PR in **draft** status (`gh pr create --draft ...`). This is the default; only omit `--draft` if explicitly told to.
    5. Check that the PR has no merge conflicts. If any are present, resolve them.
- Whenever submitting a draft PR (after review is complete in Claude Code):
    1. Mark as ready: `gh pr ready <number>`
    2. Enable auto-merge: `gh pr merge <number> --auto --squash`. This is the default; only skip if explicitly told to.
    3. Watch CI: `gh run watch`. If it fails, fix immediately and push again. The required gate is `Test Summary` — all other jobs feed into it automatically and do not need to be individually tracked in the ruleset.
- For implementation pushes (any change to runtime behavior — features, bug fixes where a test could plausibly fail): 6.
  Watch GitHub Actions inline: `gh run watch`. If CI fails, fix immediately and push again. 7. Once the PR is merged,
  GCP Cloud Build will automatically build, push to Artifact Registry, and deploy to Cloud Run. Do **not** block waiting
  for the deploy (takes ~3–5 min). At the start of the **next** conversation, check the last Cloud Build status:
  `gcloud builds list --limit=5 --region=global` and verify the deploy:
  `gcloud run services describe game-ai-website --region=us-central1`. Any failed deploy must be fixed as the first
  priority before new features.

# Dependency Management

Python dependencies are managed with **pip-tools**.

- `requirements.in` — the only file to edit directly. Lists direct dependencies only, no version pins.
- `requirements.txt` — auto-generated lockfile. **Never edit manually.** Run `pip-compile` to regenerate it.

To add or remove a Python dependency:

1. Edit `requirements.in`
2. Run `python -m piptools compile requirements.in --output-file requirements.txt --strip-extras --upgrade`
3. Commit both files together

Transitive dependencies (e.g. `pydantic-core`) are resolved automatically by pip-compile and must never be added to
`requirements.in` or edited in `requirements.txt` directly. Renovate handles pip-compile natively: it edits
`requirements.in` and regenerates `requirements.txt` in the same PR.

# Testing

## Test Tiers

| Tier            | Runner                      | Location                                   | Requires DB                           |
| --------------- | --------------------------- | ------------------------------------------ | ------------------------------------- |
| Unit (Python)   | pytest                      | `tests/unit/`                              | No                                    |
| Unit (Frontend) | Vitest                      | `src/frontend/src/**/*.test.{ts,tsx}`      | No                                    |
| Integration     | pytest                      | `tests/integration/`                       | Yes (PG on port 5433)                 |
| API             | pytest + FastAPI TestClient | `tests/api_tests/`                         | Yes (PG on port 5433)                 |
| E2E             | Playwright                  | `tests/e2e/`, `tests/smoke/`, `tests/api/` | Yes (PG on port 5432, server running) |

Any `.spec.{js,ts}` file under the directories matched by `playwright.config.js` globs (`tests/api/`, `tests/auth/`, `tests/database/`, `tests/e2e/`, `tests/games/`, `tests/performance/`, `tests/smoke/`) is automatically included in the nightly cross-browser E2E job (`nightly-e2e.yml`).

## Running Tests Locally

```bash
# Unit tests only (fast, no Docker)
npm run test:fast

# Full suite with Docker PG
docker compose -f docker-compose.test.yml up -d
python -m pytest tests/ -x --tb=short
npx vitest run
docker compose -f docker-compose.test.yml down

# E2E (requires built frontend + running server)
npm run build
npx playwright test --project=chromium
```

## Test Coverage Rules

These rules ensure test coverage is maintained and never reduced as a side effect of fixing issues.

1. **Never delete or weaken a test to fix a failure.** If a test fails, the fix must be in the code under test or in
   test data/fixtures -- not in removing assertions or reducing the test scope. The only exception is if the test itself
   is asserting incorrect behavior (e.g., testing a bug as if it were a feature).

2. **Every new endpoint, component, or game engine method must have corresponding tests** at the appropriate tier.
   Backend logic gets pytest unit tests. Frontend components get Vitest tests. API routes get TestClient tests.

3. **Test correctness means exact values.** Assert specific cell contents, exact counts, precise field values -- not
   just "no error" or type checks. See `features/test-coverage-overhaul/spec.md` for the data correctness principle.

4. **New features must include a Test Cases section in their spec.** Each test case lists the tier, test name, and
   scenario. The feature is not complete until all automated test cases pass in CI.

5. **When modifying existing code, run the relevant test tier before pushing.** If you change game engine logic, run
   `python -m pytest tests/unit/ -x`. If you change a component, run `npx vitest run`. If you change API routes, start
   the test DB and run `python -m pytest tests/api_tests/ -x`.

6. **If a test must be removed**, document the reason in the commit message and ensure the behavior it covered is either
   no longer relevant (feature removed) or covered by a different test.

## Deterministic AI for Testing

When `ENVIRONMENT=test`, game route handlers accept an `X-AI-Moves` header (comma-separated move list). This creates a
`DeterministicAIStrategy` that plays predetermined moves instead of the real AI, enabling reproducible game flow tests.
The header is ignored in `development` and `production` environments.

## Pre-Push Hook

Husky runs `npm run test:fast` on every `git push` (Vitest + pytest unit + lint + format check). Bypass with
`--no-verify` if needed, but CI is the hard gate.

# General Instructions

- You will be told if the conversation is either planning or implementation. If not told, ask.
    - For planning, reference "Adding a New Feature" steps 1-4.
    - For implementation, reference "Adding a New Feature" step 5.
- When implementing a new feature, scan the full codebase for existing code to build on. All current code is synced to
  the project files.
- Backend changes go in `src/backend/`. Frontend components in `src/frontend/src/`, styles in
  `src/frontend/src/styles/input.css`.
- Use `logging` (not `print`) for all backend output.
- All DB queries use parameterized statements via psycopg2 cursor.execute.
- Check your work:
    - Never re-invent the wheel
    - Re-use existing methods and variables when feasible
    - Watch for any potential issues or limitations with the solution provided, and call attention to them. If possible,
      suggest a solution or request clarification.
