## Cursor Cloud specific instructions

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

Refer to `CLAUDE.md` "Testing" section and `package.json` scripts. Key commands:

- `npm run test:fast` — Vitest + pytest unit + lint + format (no DB needed)
- Integration/API tests need `docker compose -f docker-compose.test.yml up -d` (port 5433)

### Non-obvious notes

- Node.js 20 is required (not 22). Use `nvm use 20`.
- The Husky pre-push hook and `test:fast` script invoke `python` (not `python3`). The VM snapshot includes a symlink
  `sudo ln -sf /usr/bin/python3 /usr/local/bin/python`. If a fresh VM is missing it, recreate it.
- Python packages install to `~/.local/bin` — ensure it is on PATH.
- Docker is needed for PostgreSQL. In Cloud Agent VMs, Docker requires `fuse-overlayfs` storage driver and
  `iptables-legacy` — see the setup hints in the system prompt.
- The OTel console exporter may log `ValueError: I/O operation on closed file` after pytest runs. This is benign and
  does not indicate test failure.
- The ESLint `--max-warnings=0` check (`lint:check`) will flag existing JSDoc warnings — these are pre-existing, not
  caused by agent changes.
- `CLAUDE.md` `format:check` warns about `CLAUDE.md` formatting — also pre-existing.
- The Husky pre-push hook runs `npm run test:fast`. Bypass with `--no-verify` if needed but CI is the hard gate.
- The backend serves the built frontend from `dist/` — run `npm run build` before starting the backend if you need the
  full app at port 8000 without the Vite dev server.
