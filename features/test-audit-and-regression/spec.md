# Test audit, live-game coverage, and regression discipline

**Status: ready**

## Goal

1. Audit current test coverage and document gaps.
2. Fix structural inconsistencies across test files.
3. Keep **documentation** the source of truth for how we add features, fix bugs, and maintain tests for the life of the
   project.

This spec is **test and process documentation first**: land policy in **`spec.md`** and **`CONTRIBUTING.md`** without
touching application code under `src/backend/` or `src/frontend/src/`. **Exception (one-time):** extending the smoke
route list in `tests/smoke/routes.spec.js` to match **live games** shipped before this policy is acceptable in the same
PR as the docs; after that, keep doc-only PRs free of test file edits and put smoke or E2E changes in implementation PRs.
Bug reports live in **GitHub Issues**, not in the repository as standalone “bug files.”

---

## Definitions

### Live game

A **live game** is any game exposed in production routing that a user can open from the hub and play through the normal
UI, **including** games that are playable without an AI (human-vs-human or incomplete AI is still live if the route and
core loop ship).

**Current live games (must have automated coverage as below):** Tic-tac-toe, Checkers, Chess, Connect4, Dots and Boxes.

**Not live until explicitly promoted:** Pong remains in design/development; it is excluded from the “five live games”
checklist until `features/game-pong/spec.md` (or product docs) mark it shipped and routes are enabled for users.

When Pong (or any new game) goes live, contributors **must** extend smoke routes, E2E game-flow specs, and any API
contracts in the same delivery as the feature (see **CONTRIBUTING.md** — Live games and coverage).

### Bug

A **bug** is a **direct violation of documented behavior** (spec, ADR, or **CONTRIBUTING.md** / user-facing docs that we
treat as contract), **without** requiring a new infrastructure or architectural decision. If fixing it needs new infra,
env vars, or a product decision, treat it as a **feature or ADR-level** change: update the spec first, then implement.

---

## Relationship to full-site coverage

**North star:** automated tests should cover the product so that regressions are caught as early as the right tier
allows (unit → API → integration → E2E).

**Where this is specified elsewhere:** `features/test-coverage-overhaul/spec.md` is the umbrella for pyramid balance, CI
tiers, deterministic AI, TestClient vs Playwright, and long-term coverage goals across the stack.

**Scope of _this_ spec:** close known gaps called out in Part 1–2 below (live game E2E parity, leaderboard integration
cases, chess FEN API assertion, test file consistency). It does **not** replace the overhaul spec for “entire website
E2E in one milestone”; remaining site flows should gain coverage through their **feature specs’ Test Cases** and through
the overhaul plan until the north star is met.

---

## Part 1: Audit findings

### Coverage gaps

| Area                   | Current coverage                   | Gap                                                                                              |
| ---------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| E2E game flows         | TTT only (`tests/e2e/ttt.spec.ts`) | Checkers, Chess, Connect4, Dots and Boxes need the same style of flow tests                      |
| Playwright API         | TTT only (`tests/api/ttt.spec.ts`) | Other games have pytest API tests but thin or no Playwright API specs where browser/auth matters |
| Leaderboard            | `test_stats.py` — minimal          | No test for excluded private stats, weak pagination assertions                                   |
| Auth password contract | E2E vs helpers can disagree        | Align on seeded passwords (`password123`); see `features/nightly-e2e-fix/spec.md` where relevant |
| Game-over flows        | Not consistently in E2E            | Win/loss/draw overlays should be exercised per live game                                         |
| Optimistic UI          | Not consistently tested            | Player move visible before SSE settles where applicable                                          |
| Chess FEN storage      | Not asserted at API level          | `board_state` / FEN shape after moves                                                            |

### Structural issues

1. **Two parallel API suites:** `tests/api_tests/` (pytest + TestClient) and `tests/api/` (Playwright). Pytest is
   preferred for payload and data correctness; Playwright API tests fit auth, cookies, and real HTTP edge cases. Avoid
   duplicating the same assertion in both without reason; document which suite owns which contract.

2. **`api-endpoints.spec.js` is plain JS** in a TypeScript-heavy tree: convert to `.ts` or replace with pytest coverage
   if redundant.

3. **Seed password mismatch** (historical): E2E and helpers must match **CONTRIBUTING.md** seeded accounts.

---

## Part 2: Coverage improvements

### E2E per live game

Add `tests/e2e/{checkers,chess,connect4,dots-and-boxes}.spec.ts` (TTT already exists), each covering at minimum:

- Unauthenticated user sees login prompt when a move or protected action requires auth (if applicable to that game).
- Game start overlay on first load.
- Starting a game (e.g. “Go first” or equivalent control for that game).
- At least one player action reflected in the UI (use **`X-AI-Moves`** in CI for any AI-dependent steps so flows stay
  deterministic).
- Terminal state reaches a **game-over** overlay (win, loss, or draw — whichever is easiest to force with deterministic
  moves for that game).
- **New game** (or equivalent) available after end of game.

Games without AI still need E2E for human-side flows; omit AI-only steps only where the product truly has no AI path.

### Leaderboard integration

In `tests/integration/test_stats_queries.py` (or the module that owns leaderboard queries):

- User with `stats_public=False` does not appear on the public leaderboard.
- User with `stats_public=True` and qualifying completed games appears.
- Pagination returns the correct slice when `page` > 1.

### Chess FEN

In `tests/api_tests/test_chess.py`:

- After a move, persisted `board_state` (or equivalent field documented in the chess feature spec) is a **valid FEN**
  string for the contract we document.

---

## Part 3: Bugs, issues, and regression tests

### Workflow

1. **Confirm documented behavior** — spec, ADR, or **CONTRIBUTING.md** / locked docs.
2. **Open a GitHub Issue** describing the violation, with links to the doc section and minimal reproduction. Issues do
   **not** depend on a prior PR merge; they track work independently.
3. **Implement the fix** in a PR that **references the issue** (e.g. `Fixes #123`).
4. **Add or extend an automated regression test** in the same PR as the fix (pytest, TestClient, Vitest, or Playwright
   as appropriate). The test encodes the corrected contract. Prefer **red → green** locally when feasible; CI must be
   green before merge.
5. **Never** commit standalone “bug description” files in lieu of an Issue.

### Tier selection for regression tests

| Bug in                     | Primary test tier                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Backend logic              | pytest unit (`tests/unit/`)                                                                          |
| API behavior / persistence | pytest + TestClient (`tests/api_tests/` or `tests/integration/`)                                     |
| UI or cross-stack flow     | Playwright (`tests/e2e/`, `tests/smoke/`, etc.) with deterministic AI when the bug involves AI turns |

Cross-layer bugs may need more than one test; the feature spec or issue should say so.

### Naming

Use clear names such as `test_regression_issue_123_board_state_persists` or Playwright titles that mention the issue
slug; consistency matters more than a rigid prefix.

---

## Scope (files)

### Create

- `tests/e2e/checkers.spec.ts`
- `tests/e2e/chess.spec.ts`
- `tests/e2e/connect4.spec.ts`
- `tests/e2e/dots-and-boxes.spec.ts`

### Modify

- `tests/smoke/routes.spec.js` — include every **live** game slug in the route smoke list
- `tests/integration/test_stats_queries.py` (or equivalent) — leaderboard cases
- `tests/api_tests/test_chess.py` — FEN assertion
- `tests/api/api-endpoints.spec.js` → TypeScript or replacement per Part 1

### Do not modify (for this spec’s own delivery)

- Application source under `src/backend/` and `src/frontend/src/` except when a **separate** bugfix PR is required to
  satisfy a failing regression test.

---

## Acceptance criteria

- All **current live games** have E2E flow coverage in `tests/e2e/` in the style of TTT.
- Leaderboard public/private and pagination behaviors have integration (or equivalent) tests.
- Chess persistence asserts FEN (or documented equivalent) at API level.
- **CONTRIBUTING.md** describes live games, bug-vs-feature, GitHub Issues, and regression tests alongside existing
  workflow.
- Smoke route checks cover every **live** game slug at `/game/{id}` (see `tests/smoke/routes.spec.js`).
- No test files deleted without replacement coverage and rationale in commit message.

---

## Test Cases

| Tier        | Test name / file                    | Scenario                                                    |
| ----------- | ----------------------------------- | ----------------------------------------------------------- |
| Smoke       | `tests/smoke/routes.spec.js`        | Each live game route loads (no 404 / error title)           |
| E2E         | `tests/e2e/checkers.spec.ts`        | Live game flow: auth gate, start, move, game over, new game |
| E2E         | `tests/e2e/chess.spec.ts`           | Same for chess                                              |
| E2E         | `tests/e2e/connect4.spec.ts`        | Same for Connect4                                           |
| E2E         | `tests/e2e/dots-and-boxes.spec.ts`  | Same for Dots and Boxes                                     |
| Integration | `test_stats_queries.py` (names TBD) | Private stats excluded; public included; pagination slice   |
| API         | `test_chess.py` (name TBD)          | After move, `board_state` matches FEN contract              |

---

## Not doing (here)

- **Pong** E2E until it is a live game.
- **Replacing** `features/test-coverage-overhaul/spec.md` — complementary, not duplicate.
- **Slash commands or repo-local “/bug” skills** as the bug intake path — GitHub Issues are authoritative.
- **Broad rewrite** of all Playwright JS specs beyond what is listed in Part 2.
- **Doc-only PRs that also edit tests** after the one-time smoke list alignment above; ship test changes with the
  implementation PR that needs them.

---

## Open questions

- Whether `tests/games/*.spec.js` should merge into `tests/e2e/` or stay parallel — decide when touching those files;
  document in **CONTRIBUTING.md** once chosen.
