# Documentation

**Status: needs implementation**

## Background

As external collaborators (starting with ML/AI engineers) begin integrating with this codebase, the lack
of inline documentation and contributor guides creates friction. This spec defines:

1. **Inline docstrings** on all public functions, classes, and endpoints across both the Python backend
   and TypeScript frontend — enforced by lint in CI.
2. **Change guides** in a `CONTRIBUTING.md` written for a non-technical data science audience, covering
   common operations (DB changes, adding AI files, running locally).
3. **README overhaul** — simplified to goal-action pairs, removing outdated content, adding a GCP
   access stub.
4. **Pre-submit checks** — a local git pre-commit hook that runs Prettier and docstring lint before
   each commit.

## Docstring Style

### Python — Google-style docstrings

Use Google-style docstrings for all public functions, classes, and modules in `src/backend/`.

```python
def record_move(
    session: AsyncSession, game_id: UUID, game_type: str,
    move_notation: str, board_state_after: dict
) -> None:
    """Appends a move to the game record and updates the live board state.

    Called after every validated player or AI move. Updates move_list (append),
    board_state (overwrite), and last_move_at on the game record.

    Args:
        session: Active SQLAlchemy AsyncSession.
        game_id: UUID of the game record (same as session identifier).
        game_type: One of "chess", "tic_tac_toe", "checkers", "connect4", "dots_and_boxes".
        move_notation: Move in the standard notation for this game type.
        board_state_after: Full board state dict after the move is applied.

    Raises:
        KeyError: If game_type is not in GAME_TYPE_TO_MODEL.
        SQLAlchemyError: Propagated from the async session on DB failure.
    """
```

### TypeScript — JSDoc

Use JSDoc on all exported functions, classes, hooks, and components in `src/frontend/src/`.

```typescript
/**
 * Fetches the active game session for the current user.
 *
 * @param gameType - The game type identifier (e.g. "chess", "tic_tac_toe").
 * @returns The active game session, or null if none exists.
 * @throws {ApiError} If the request fails with a non-404 status.
 */
export async function getActiveGame(gameType: string): Promise<GameSession | null> {
```

### What gets documented

**Always document:**
- All public functions and methods (Python and TypeScript/TSX)
- All exported React components and custom hooks
- All class definitions
- Module-level file summary (one line is sufficient for most files)

**Skip:**
- Private helpers (`_` prefix in Python; unexported in TypeScript)
- Trivial one-liners where the signature is fully self-documenting
- Test functions
- Generated or migration files

## Lint Enforcement

### Python — pydocstyle

Add `pydocstyle` to `requirements.txt`. Configure via `setup.cfg` at the repo root:

```ini
[pydocstyle]
convention = google
match = (?!test_|_).*\.py
match_dir = (?!tests|migrations|__pycache__).*
```

Enforces Google-style docstring presence on all non-test, non-private Python files. Individual rules
can be disabled via `add-ignore` (e.g., `D107` for `__init__` if needed). Entire directories can be
excluded via `match_dir` — if a contributor's folder needs looser rules, it is a one-line change.

Add to CI `code-quality` job:
```yaml
- run: pip install -r requirements.txt
- run: pydocstyle src/backend/
```

### TypeScript — eslint-plugin-jsdoc

Add `eslint-plugin-jsdoc` to devDependencies. ESLint config (`eslint.config.js` at repo root, flat
config format to match `@eslint/js` already installed):

```js
import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';

export default [
  js.configs.recommended,
  {
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': ['error', {
        require: {
          FunctionDeclaration: true,
          MethodDefinition: true,
          ClassDeclaration: true,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
        }
      }],
      'jsdoc/require-param': 'warn',
      'jsdoc/require-returns': 'warn',
    }
  }
];
```

`require-jsdoc` at `error` level blocks CI on missing docstrings. `require-param` and `require-returns`
at `warn` — visible in output but do not fail the build during the backfill period. Upgrade both to
`error` once the backfill is complete.

Add lint scripts to root `package.json`:
```json
"lint": "eslint src/frontend/src/",
"lint:check": "eslint src/frontend/src/ --max-warnings=0"
```

CI uses `lint:check` (zero warnings). During the backfill PR, CI uses `lint` to allow warnings while
the full coverage is being added.

Add to CI `code-quality` job after `format:check`:
```yaml
- run: npm run lint:check
```

## Pre-Submit Hook

A git pre-commit hook that runs before every local commit. One-time setup per machine.

**What it runs (in order):**
1. `npm run format` — Prettier auto-formats staged TS/JS/CSS/HTML files (write mode — auto-fixes,
   does not error)
2. `npm run lint` — ESLint + jsdoc on TypeScript
3. `pydocstyle src/backend/` — docstring presence on Python

Prettier runs in write mode locally so formatting is fixed automatically before the commit lands.
CI still runs `format:check` as a safety net.

**Setup** (one-time, documented in CONTRIBUTING.md):
```bash
cp scripts/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

The hook script lives at `scripts/pre-commit` and is checked into the repo. Running the command
above activates it for that machine.

## Backfill

All existing public methods in `src/backend/` and `src/frontend/src/` need docstrings added as a
one-time pass before lint is enforced in CI.

**Backend files:**
- `app.py`, `auth.py`, `auth_service.py`, `database.py`, `games.py`, `models.py`, `telemetry.py`
- `game_logic/` — all game AI files
- `game_engine/` — base ABC and all engine implementations

**Frontend files:**
- `api/` — all query/mutation hooks
- `components/` — all exported components
- `hooks/` — all custom hooks
- `pages/` and `pages/games/` — all page components
- `store/` — all store definitions and actions
- `types/` — file-level summaries where the types are non-obvious

The backfill pass is also an opportunity to flag inconsistencies, unused exports, or dead code.
Any findings should be noted in the PR description.

## CONTRIBUTING.md

A new file at the repo root. Written for a data science audience — goal-action pairs with minimal
explanation. Not split by role; assumes no frontend development experience.

**Sections:**
1. **Getting started** — prerequisites (Docker Desktop only; no Node or Python install needed),
   single command to start the full stack locally
2. **Running locally** — `docker compose up` starts backend + DB with seed data at `localhost:8000`;
   `docker compose build app` needed only after pulling frontend changes
3. **Pre-submit setup** — one-time hook install command, what the hook does, how to interpret failures
4. **Adding AI logic for a game** — folder structure, naming convention, which class to subclass,
   which method to implement, how to wire the new strategy into the game router
5. **Reading game state and move history** — what `board_state` and `move_list` contain; field
   reference per game type
6. **Modifying the database** — when and why, step-by-step Alembic commands
7. **Adding logging or telemetry** — one-liner examples using the existing logger and tracer
8. **Writing docstrings** — short before/after example for Python and TypeScript
9. **Checking your work** — how to run pre-submit checks manually; what each failure means

## README Overhaul

The README is the first thing a contributor sees on GitHub. It should be short, accurate, and
actionable. All detailed how-to content moves to CONTRIBUTING.md.

**Remove or move to CONTRIBUTING.md:**
- Detailed prerequisites section
- Expanded local dev workflow descriptions
- Workflows-by-role section
- Outdated test command list

**Keep and update:**
- Stack table
- Quick start (3 commands max: clone, install, up)
- Test credentials table
- Project structure tree (update to reflect current layout including `game_engine/`)
- Deployment section (accurate, keep brief)
- Prominent link to CONTRIBUTING.md — GitHub automatically surfaces `CONTRIBUTING.md` at the repo
  root in two places: a banner shown when opening issues or PRs, and the community profile sidebar.
  The README should also link to it directly so it is findable from the homepage without opening
  an issue.

**Add:**
- GCP access section — stub only. Placeholder for Cloud Run logs, Cloud SQL console, Cloud Trace
  links. Content to be filled in before Brian's first GCP access is needed.

## AI Integration Guide

The integration guide stub in the previous version of this spec is preserved. A full dedicated guide
will be written as a follow-up once the chess spec implementation is complete (Phase 5). The
CONTRIBUTING.md "adding AI logic" section covers the structural wiring; the full guide covers the
game state shape, move notation format, and retry/fallback behavior in detail.

## Test Cases

| Tier | Name | What it checks |
|------|------|----------------|
| CI (lint) | pydocstyle — backend coverage | All public Python functions in `src/backend/` have Google-style docstrings; CI fails if missing |
| CI (lint) | eslint-plugin-jsdoc — frontend coverage | All exported TypeScript functions and components have JSDoc; CI fails if missing |
| CI (format) | Prettier check | All source files pass Prettier format check (already in CI; unchanged) |
| Manual | Backfill review | All existing methods have accurate docstrings covering params, return value, and purpose |
| Manual | CONTRIBUTING.md walkthrough | A contributor can start the local environment and play a game using only CONTRIBUTING.md |
| Manual | AI wiring guide | Following the "adding AI logic" section produces a working AI move in a game router |
| Manual | GCP stub present | GCP access section exists in README; filled in before first GCP access is needed |
