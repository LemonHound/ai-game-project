# AI assistants in this repository

Human-readable defaults for automation and coding agents. **Authoritative detail:** [CONTRIBUTING.md](CONTRIBUTING.md).

## Non-negotiables

- **Spec-first:** Non-trivial work is driven by `features/<name>/spec.md` (see CONTRIBUTING). Do not ship behavior that
  is not reflected in the spec and its **Test Cases** section.
- **ADR when it matters:** If the change encodes a significant, long-lived architectural or product decision, add or
  update `adr.md` in the same feature folder (see CONTRIBUTING for the bar).
- **Code locations:** Backend in `src/backend/`, frontend in `src/frontend/src/`, shared styles in
  `src/frontend/src/styles/input.css`.
- **Backend:** Use `logging`, not `print`. Parameterize all SQL (`psycopg2` / `cursor.execute` with placeholders).
- **Secrets:** Never commit production secrets. Production uses GCP Secret Manager, not checked-in `.env`.

## Before you push

- Run **`npm run test:fast`** locally before every push (covers Vitest, pytest unit, ESLint, Prettier). Add tiers from
  CONTRIBUTING when appropriate. **Do not** push untested and rely on CI for format/lint/tests; **`--no-verify`** only
  if the user explicitly allows it.
- CI gate on GitHub: **Test Summary**.

## Pull requests

Unless the user opts out: after **`gh pr create`**, run **`gh pr checks <pr> --watch`**. When marking ready to land, use
**`gh pr merge <pr> --auto --squash`** by default.

**GitHub writes from agents:** Run **`gh pr create`**, **`gh pr edit`**, and **`gh pr merge`** only in a **local**
terminal where `gh` is you (see **CONTRIBUTING.md §1e**). On **sub-agents**, skip those commands and use the **§1c
handoff** block in CONTRIBUTING so a local session or the human applies the title, body, and merge.

## Planning vs implementation

If the user has not said whether the task is **planning** (spec/design) or **implementation**, ask once. Planning
follows CONTRIBUTING’s design steps; implementation follows the finalized spec.

## Sub-agents

**GitHub CLI:** Sub-agents should use **`gh pr view` / `diff` / `checks`** only. For **`gh pr edit`**,
**`gh pr merge`**, or **`gh pr create`**, follow **CONTRIBUTING.md §1c handoff** and run writes **locally** (or on the
GitHub website). See **§1e** for authentication constraints on sub-agents.

### Services overview

| Service                    | How to start              | Port |
| -------------------------- | ------------------------- | ---- |
| PostgreSQL 17              | `docker compose up -d db` | 5432 |
| FastAPI backend            | See below                 | 8000 |
| Vite dev server (optional) | `npm run dev:frontend`    | 5173 |

### Starting the backend (outside Docker)

```bash
export DB_HOST=localhost DB_PORT=5432 DB_NAME=ai_game_db DB_USER=dev_user DB_PASSWORD=dev_password ENVIRONMENT=development WEBSITE_URL=http://localhost:8000 PORT=8000
cd src/backend && python3 -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Or use `npm run dev` which starts both Vite + backend via concurrently.

### First-run setup (after DB starts)

```bash
DB_HOST=localhost DB_PORT=5432 DB_NAME=ai_game_db DB_USER=dev_user DB_PASSWORD=dev_password python3 -m alembic upgrade head
DB_HOST=localhost DB_PORT=5432 DB_NAME=ai_game_db DB_USER=dev_user DB_PASSWORD=dev_password python3 scripts/seed_test_data.py
```

### Running tests

See **[CONTRIBUTING.md](CONTRIBUTING.md)** (Running tests) and `package.json` scripts. Key commands:

- `npm run test:fast` — Vitest + pytest unit + lint + format (no DB needed)
- Integration/API tests need `docker compose -f docker-compose.test.yml up -d` (port 5433)

### Non-obvious notes

- Node.js 20 is required (not 22). Use `nvm use 20`.
- `npm run test:fast` invokes pytest via **`python3`**. Ensure `python3` is on PATH; on some VMs a `python` → `python3`
  symlink is added. If a fresh VM is missing it, recreate it.
- Python packages may install to `~/.local/bin` — ensure it is on PATH.
- Docker is needed for PostgreSQL. In sub-agent environments, Docker may require `fuse-overlayfs` storage driver and
  `iptables-legacy` — see setup hints in the environment documentation.
- The OTel console exporter may log `ValueError: I/O operation on closed file` after pytest runs. This is benign and
  does not indicate test failure.
- The ESLint `--max-warnings=0` check (`lint:check`) may flag existing JSDoc warnings — treat as pre-existing unless
  your change touched those files.
- The Husky pre-push hook runs `npm run test:fast`. Prefer fixing failures locally over `--no-verify`; CI remains the
  merge gate.
- The backend serves the built frontend from `dist/` — run `npm run build` before starting the backend if you need the
  full app at port 8000 without the Vite dev server.
