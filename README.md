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

## Quick Start

**Prerequisites:** Docker Desktop only.

```bash
git clone https://github.com/LemonHound/ai-game-project.git
cd ai-game-project
docker compose build
docker compose up
```

The app is available at `http://localhost:8000`. Log in with:

| Username   | Password      |
| ---------- | ------------- |
| `testuser` | `password123` |

---

## Project Structure

```
ai-game-project/
├── src/
│   ├── backend/
│   │   ├── app.py                  # FastAPI entry point
│   │   ├── auth.py                 # Auth routes (local + Google OAuth)
│   │   ├── auth_service.py         # Auth business logic
│   │   ├── db.py                   # PostgreSQL connection pool
│   │   ├── db_models.py            # SQLModel table definitions
│   │   ├── games.py                # Game API routes
│   │   ├── models.py               # Pydantic request/response models
│   │   ├── persistence_service.py  # Game session read/write
│   │   ├── telemetry.py            # OpenTelemetry setup
│   │   ├── game_engine/            # SSE-based engine layer
│   │   │   ├── base.py             # GameEngine + AIStrategy base classes
│   │   │   ├── ttt_engine.py
│   │   │   ├── connect4_engine.py
│   │   │   ├── checkers_engine.py
│   │   │   ├── dab_engine.py
│   │   │   └── chess_engine.py
│   │   └── game_logic/             # Legacy game logic (still used for some routes)
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
│           ├── api/                # Fetch wrappers per game + auth
│           ├── components/         # Shared UI components
│           ├── hooks/              # Custom React hooks
│           ├── pages/              # Route-level components
│           │   └── games/          # One component per game
│           ├── store/              # Zustand stores
│           └── types/              # TypeScript interfaces
├── tests/                          # Playwright (E2E/API/smoke) + Jest (unit)
├── features/                       # Feature specs (see CLAUDE.md)
├── scripts/
│   └── pre-commit                  # Git hook: format → lint → pydocstyle
├── .github/workflows/
│   ├── tests.yml                   # CI: lint, unit, smoke
│   └── deploy.yml                  # CD: build → Artifact Registry → Cloud Run
├── docker-compose.yml
└── Dockerfile
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add AI logic, read game data, run tests, and set up the pre-commit hook.

---

## Deployment

Merging to `main` triggers the deploy pipeline automatically:

1. CI tests must pass
2. Docker image is built and pushed to GCP Artifact Registry
3. Cloud Run service is updated

The production service runs on GCP Cloud Run backed by Cloud SQL (PostgreSQL).

### GCP Access

| Resource       | Where to find it                                                |
| -------------- | --------------------------------------------------------------- |
| Cloud Run logs | GCP Console → Cloud Run → `game-ai-website` → Logs             |
| Cloud SQL      | GCP Console → Cloud SQL → `game-ai-db`                         |
| Cloud Trace    | GCP Console → Trace → Trace list                                |
| Cloud Build    | `gcloud builds list --limit=5 --region=global`                  |

Contact the team for GCP project access.
