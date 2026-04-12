# AI Game Hub — Project Context

## Stack

- Backend: FastAPI (Python 3.11+), PostgreSQL via psycopg2
- Frontend: React 18 + TypeScript, Vite, React Router v6, TanStack Query, Zustand, Tailwind CSS + DaisyUI
- Observability: OpenTelemetry — auto-instrumented FastAPI + psycopg2; GCP Cloud Trace + Cloud Monitoring in prod, console exporter locally
- Testing: Vitest (unit), pytest (unit), Playwright (E2E / API / smoke)
- CI/CD: GitHub Actions (CI tests) + GCP Cloud Build (build & deploy) → GCP Cloud Run
- Secrets: GCP Secret Manager — never use `.env` in production
- Logs: GCP Cloud Logging via stdout from Cloud Run — never use `print()`

## Code locations

- Backend: `src/backend/`
- Frontend: `src/frontend/src/`
- Styles: `src/frontend/src/styles/input.css`

## Conventions

**Backend:** Use `logging`, not `print`. All DB queries use parameterized statements via psycopg2 `cursor.execute`.

**Secrets:** Never commit production secrets. Use GCP Secret Manager in production.

**Docstrings:** All public Python functions use Google-style docstrings. All exported TypeScript functions and React components use JSDoc.

## Dependency management

Python dependencies are managed with pip-tools.

- `requirements.in` — edit directly; lists direct dependencies only, no version pins
- `requirements.txt` — auto-generated lockfile; never edit manually; regenerate with `pip-compile`

To add or remove a dependency: edit `requirements.in`, then run:

```bash
python -m piptools compile requirements.in --output-file requirements.txt --strip-extras --upgrade
```

Commit both files together.

## Testing

- `npm run test:fast` — Vitest + pytest unit + ESLint + Prettier (no DB needed)
- Integration/API tests require `docker compose -f docker-compose.test.yml up -d` (port 5433)
- CI gate: **Test Summary** check on GitHub

See [CONTRIBUTING.md](CONTRIBUTING.md) for full test tier details (unit / API integration / E2E / manual).

## Feature workflow

Non-trivial work is driven by `features/<name>/spec.md`. Each spec must include a **Test Cases** section listing tier, scenario, and test name. A feature is not complete until all automated test cases pass in CI.

See [AGENTS.md](AGENTS.md) for agent-specific behavioral rules.
See [CONTRIBUTING.md](CONTRIBUTING.md) for full setup and workflow details.
