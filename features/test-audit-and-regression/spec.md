# Test Audit and Regression System

## Goal

1. Audit current test coverage and document gaps
2. Fix structural inconsistencies across test files
3. Introduce a `/bug` slash command that creates a regression test case from a bug description

---

## Part 1: Audit Findings

### Coverage Gaps

| Area | Current coverage | Gap |
|---|---|---|
| E2E game flows | TTT only (`tests/e2e/ttt.spec.ts`) | Checkers, Chess, Connect4, DotsAndBoxes have no E2E |
| Playwright API | TTT only (`tests/api/ttt.spec.ts`) | Other games have thin API tests in `tests/api_tests/` but no Playwright API tests |
| Leaderboard | `test_stats.py` — minimal | No test for "no entries when stats_public=False", no pagination test |
| Auth password contract | E2E ttt uses `password123`; api-endpoints helper uses `demo123` | These differ — only one can be correct |
| Game-over flows | Not tested in any E2E | Win/loss/draw state never exercised by Playwright |
| Optimistic UI | Not tested | No test that player move appears before SSE response |
| Checkers AI timing | Not tested | No test that bot delay >= 2000ms |
| Chess FEN storage | Not tested at API level | No assertion on board_state format |

### Structural Issues

1. **Two parallel API test suites**: `tests/api_tests/` (pytest + TestClient) and `tests/api/` (Playwright .spec.ts/.js). These serve different purposes but overlap on game endpoints. The pytest TestClient tests are the right tool for data-correctness assertions; Playwright API tests are better for auth flows and SSE.

2. **api-endpoints.spec.js is plain JS in a TypeScript project**: All other Playwright tests are `.ts`. This file should be converted or replaced.

3. **Seed password mismatch**: `ttt.spec.ts` E2E uses `password123`; `auth-helper.js` uses `demo123`. The correct password is `password123` (matching the hash). Fix tracked in `features/nightly-e2e-fix/spec.md`.

---

## Part 2: Coverage Improvements

### New E2E game tests

Add `tests/e2e/{checkers,chess,connect4,dots-and-boxes}.spec.ts` — one per game, covering:
- Unauthenticated user sees login prompt
- Game start overlay shows on page load
- Clicking "Go first" starts the game
- Player move is reflected immediately (optimistic display)
- Game-over overlay appears on terminal state
- "New Game" buttons are available after game ends

Use the deterministic AI header (`X-AI-Moves`) for reproducible game flows in CI.

### Leaderboard coverage

Add to `tests/integration/test_stats_queries.py`:
- `test_leaderboard_excluded_when_stats_private`: user with `stats_public=False` does not appear
- `test_leaderboard_included_when_stats_public`: user with `stats_public=True` and completed games appears
- `test_leaderboard_pagination`: returns correct slice when page > 1

### Chess FEN coverage

Add to `tests/api_tests/test_chess.py`:
- `test_chess_move_stores_fen`: `board_state` field after a move is a valid FEN string

---

## Part 3: Bug Regression Tool — `/bug` Slash Command

### Problem

When a bug is found (by the user or in testing), the current workflow is:
1. File a GitHub issue
2. Fix the bug
3. Maybe add a test

Step 3 is optional and often skipped. Bugs recur because there's no test enforcing the fixed behavior.

### Solution

A `/bug` slash command that creates a failing regression test before the fix is written. This enforces the test-driven approach for bug fixes: **Prove It pattern** — write a test that reproduces the bug, confirm it fails, fix the code, confirm the test passes.

### Command spec

```
/bug <description>
```

Workflow:
1. User describes the bug (natural language)
2. Agent determines the appropriate test tier (unit / API / E2E) based on the bug type
3. Agent writes a failing test that reproduces the bug
4. Agent verifies the test currently fails (confirming bug is reproducible)
5. Test file is saved; agent reports the test name and location
6. Implementation conversation can reference this test as the acceptance criterion

### Rules

- Always write the test before the fix
- The test must fail before the fix (do not write a passing test)
- Test tier selection:
  - Backend logic bug → unit (pytest)
  - API behavior bug → API (pytest TestClient)
  - UI behavior bug → E2E (Playwright) using deterministic AI where needed
  - Cross-layer bug → both API + E2E
- Test names follow the pattern: `test_bug_<short_description>` (Python) or `bug: <description>` (Playwright)

### Skill file location

Create `C:\Users\seiwe\.claude\skills\bug\SKILL.md` — invocable as `/bug`.

---

## Scope

### Files to create
- `tests/e2e/checkers.spec.ts`
- `tests/e2e/chess.spec.ts`
- `tests/e2e/connect4.spec.ts`
- `tests/e2e/dots-and-boxes.spec.ts`
- `C:\Users\seiwe\.claude\skills\bug\SKILL.md` — the /bug slash command

### Files to modify
- `tests/integration/test_stats_queries.py` — leaderboard coverage
- `tests/api_tests/test_chess.py` — FEN assertion
- `tests/api/api-endpoints.spec.js` → convert to `.ts` (or replace)

### Files NOT to modify
- Any backend or frontend source file (this spec is test-only)

## Acceptance Criteria

- All 5 games have E2E tests in `tests/e2e/`
- Leaderboard behavior (public/private) has integration test coverage
- `/bug <description>` produces a failing test that documents the reproduction case
- No test files are deleted as part of this work

## Test Cases

*This spec adds tests rather than requiring them. The acceptance criteria above serve as the verification.*

| Manual check | Criteria |
|---|---|
| `/bug "checkers: bot responds instantly"` | Produces a failing `test_bug_checkers_bot_responds_instantly` pytest test |
| `/bug "leaderboard shows no data"` | Produces a failing Playwright or pytest test demonstrating empty leaderboard with stats_public=False default |
| All 4 new E2E files pass in `nightly-e2e.yml` | CI green after this feature ships |
