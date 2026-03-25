# AI Game Hub

A web-based AI game platform featuring classic games with adaptive AI opponents.

## Stack

| Layer         | Technology                                                 |
| ------------- | ---------------------------------------------------------- |
| Backend       | FastAPI (Python 3.11+), PostgreSQL                         |
| Frontend      | React 18 + TypeScript, Vite, TanStack Query, Zustand       |
| Styling       | Tailwind CSS + DaisyUI                                     |
| Observability | OpenTelemetry (GCP Cloud Trace + Cloud Monitoring in prod) |
| CI/CD         | GitHub Actions → GCP Cloud Run                             |

---

## Local Development

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — required for the database and backend
- [Node.js 20+](https://nodejs.org/) — required for the frontend dev server
- [Git](https://git-scm.com/)

### Quick Start

```bash
git clone <repo-url>
cd ai-game-project
npm install
docker compose up
```

The backend API will be available at `http://localhost:8000`.

To also run the frontend dev server with hot reload:

```bash
# In a separate terminal
npm run dev:frontend
```

Frontend will be at `http://localhost:5173`, proxying API requests to the backend container.

### Test Credentials

The database is seeded automatically on first `docker compose up`. Use any of these to log in:

| Username  | Email                 | Password    |
| --------- | --------------------- | ----------- |
| `demo`    | `demo@aigamehub.com`  | `demo123`   |
| `test`    | `test@example.com`    | `test123`   |
| `player1` | `player1@example.com` | `player123` |

### Workflows by Role

**Full-stack development** (frontend + backend):

```bash
docker compose up          # starts DB + backend on :8000
npm run dev:frontend       # starts Vite on :5173 (separate terminal)
```

**Backend / game logic only** (Python work, no frontend needed):

```bash
docker compose up          # starts DB + backend on :8000
# Edit files in src/backend/ — uvicorn hot-reloads on save, no rebuild needed
# Test via curl or any HTTP client against localhost:8000
```

**Rebuild after dependency changes** (requirements.txt or frontend package.json):

```bash
docker compose build app
docker compose up
```

### API Health Check

```bash
curl http://localhost:8000/api/health
```

---

## Project Structure

```
ai-game-project/
├── src/
│   ├── backend/
│   │   ├── app.py              # FastAPI entry point
│   │   ├── auth.py             # Auth routes (local + Google OAuth)
│   │   ├── auth_service.py     # Auth business logic
│   │   ├── database.py         # PostgreSQL connection pool
│   │   ├── games.py            # Game API routes
│   │   ├── models.py           # Pydantic models
│   │   ├── telemetry.py        # OpenTelemetry setup
│   │   └── game_logic/         # Game AI engines (Python)
│   │       ├── tic_tac_toe.py
│   │       ├── chess.py
│   │       ├── checkers.py
│   │       ├── connect4.py
│   │       └── dots_and_boxes.py
│   └── frontend/
│       ├── index.html
│       └── src/
│           ├── App.tsx             # React Router root
│           ├── main.tsx
│           ├── api/                # TanStack Query hooks
│           ├── components/         # Shared components (Navbar, AuthModal, etc.)
│           ├── hooks/              # Custom hooks
│           ├── pages/              # Route-level components
│           │   └── games/          # One component per game
│           ├── store/              # Zustand stores
│           └── types/              # TypeScript interfaces
├── tests/                      # Playwright (E2E/API/smoke) + Jest (unit)
├── scripts/
│   ├── setup-database.sql      # Schema + seed data (runs automatically in Docker)
│   └── test-setup.sql          # Test database setup for CI
├── features/                   # Feature specs (see CLAUDE.md)
├── .github/workflows/
│   ├── tests.yml               # CI: lint, unit, E2E, API, smoke
│   └── deploy.yml              # CD: build → Artifact Registry → Cloud Run
├── docker-compose.yml          # Local dev environment
└── Dockerfile                  # Multi-stage build (Node → Python)
```

---

## Running Tests

Tests require both the backend and database running. Use Docker for the backend:

```bash
docker compose up -d           # start backend + DB in background
npm run test:unit              # Jest unit tests
npm run test:e2e               # Playwright E2E tests
npm run test:smoke             # Quick smoke tests only
npm test                       # all tests
```

See `tests/README.md` for the full test guide.

---

## Deployment

Deployment is fully automated. Merging to `main` triggers the GitHub Actions deploy pipeline:

1. CI tests must pass
2. Docker image is built and pushed to GCP Artifact Registry
3. Cloud Run service is updated automatically

The production service runs on GCP Cloud Run backed by Cloud SQL (PostgreSQL).

**GCP setup is required before the first deploy.** See the setup checklist in the team docs.

---

## Adding a New Feature

See `CLAUDE.md` for the full feature development workflow (spec → design → implementation).
