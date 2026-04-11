# Nightly E2E Fix

## Problem

The nightly cross-browser E2E job (`nightly-e2e.yml`) has failed every night for at least 5 days. Two distinct root causes:

### Root Cause 1: Mismatched password hash in seed data

`scripts/seed_test_data.py` stores a bcrypt hash that corresponds to `password123`, but `tests/helpers/auth-helper.js` authenticates as `demo@aigamehub.com` with password `demo123`. Every auth-dependent test fails with `401 - Invalid email or password`.

Fix: Regenerate the hash in `seed_test_data.py` to match `demo123`.

### Root Cause 2: Stale assertions in `tests/api/api-endpoints.spec.js`

Four test cases assert behavior that doesn't match the actual API:

| Test | Expected | Actual |
|---|---|---|
| `CORS headers are present` | `access-control-allow-origin` defined | Header only appears on cross-origin requests; test sends no `Origin` header |
| `Content-Type headers are correct` | JSON content-type on `/api/games` | Route doesn't exist — it's `/api/games_list` |
| `non-existent endpoints return 404` | 404 | SPA catch-all likely returns 200 HTML for unmatched routes |
| `malformed JSON` | status in `[400, 500]` | FastAPI returns 422 for validation errors |

## Scope

- `scripts/seed_test_data.py` — fix password hash for `demo` user
- `tests/helpers/auth-helper.js` — no change needed (keep `demo123` as canonical test password)
- `tests/api/api-endpoints.spec.js` — fix 4 broken assertions to match actual API behavior:
  - CORS test: add `Origin` header to the request
  - Games list test: change `/api/games` to `/api/games_list`
  - Non-existent endpoint test: verify actual behavior (check if SPA catch-all swallows it; if so, test a route that truly 404s like `/api/nonexistent-endpoint-xyz`)
  - Malformed JSON test: include 422 in accepted status codes
- `CONTRIBUTING.md` — add a note in the Testing section clarifying that any `.spec.{js,ts}` file placed under the directories matched by `playwright.config.js` globs (`tests/api/`, `tests/auth/`, `tests/database/`, `tests/e2e/`, `tests/games/`, `tests/performance/`, `tests/smoke/`) is automatically included in the nightly cross-browser E2E job

No other files should be touched.

## Acceptance Criteria

- All three browser jobs (chromium, firefox, webkit) pass in `nightly-e2e.yml`
- The seed script correctly enables login with `demo@aigamehub.com` / `demo123`
- No tests are deleted — only assertions corrected to match true behavior

## Test Cases

| Tier | Test name | Scenario |
|---|---|---|
| E2E (manual trigger) | `nightly-e2e.yml` all browsers | Green after fix |
| E2E | `API Endpoints > CORS and Headers > CORS headers are present` | Sends Origin header, verifies response |
| E2E | `API Endpoints > CORS and Headers > Content-Type headers are correct` | Calls correct endpoint `/api/games_list` |
| E2E | `API Endpoints > Error Handling > non-existent endpoints return 404` | Correct endpoint and status code |
| E2E | `API Endpoints > Error Handling > malformed JSON requests are handled gracefully` | 422 accepted |

## Notes

- The CI server environment sets `ENVIRONMENT=test` which is important for the deterministic AI header behavior — no changes needed there.
- After fixing the password hash, verify by running `scripts/seed_test_data.py` locally and confirming login succeeds.
- Regenerate hash with: `python3 -c "import bcrypt; print(bcrypt.hashpw(b'demo123', bcrypt.gensalt(12)).decode())"`
