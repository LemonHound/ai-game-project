# React Migration Spec

**Status: done**

## Goal
Replace Jinja2 server-rendered templates + vanilla JS with a React 18 SPA.
FastAPI becomes a pure JSON API. The compiled React build is served as static
files by FastAPI with a catch-all route for client-side navigation.

## Tech Stack
| Concern | Choice | Rationale |
|---------|--------|-----------|
| Build tool | Vite 5 | Fast HMR, modern ESM, de facto standard |
| Framework | React 18 + TypeScript | Hooks, concurrent mode, strong typing |
| Routing | React Router v6 | Declarative, nested routes |
| Server state | TanStack Query v5 | Caching, refetching, loading/error states |
| Client/game state | Zustand | Minimal boilerplate, fine-grained subscriptions |
| Styling | Tailwind CSS v3 + DaisyUI | Carry over — no visual regression |
| HTTP | Native fetch via TanStack Query | No extra dependency |
| Linting | ESLint + TypeScript ESLint | Enforced via CI |
| Formatting | Prettier (already configured) | No change |

## Directory Structure (post-migration)
```
src/
  backend/          # unchanged Python API
  frontend/
    public/         # favicon, images (unchanged)
    src/
      api/          # TanStack Query hooks, one file per domain
      components/   # shared UI (Navbar, AuthModal, GameCard, etc.)
      games/        # one folder per game, each with Component + logic
      pages/        # route-level components (Home, Games, Profile, etc.)
      store/        # Zustand stores (auth, game state)
      types/        # shared TypeScript interfaces
      App.tsx
      main.tsx
    index.html
    vite.config.ts
    tsconfig.json
```

## Backend Changes
- Remove all Jinja2 template routes from `app.py`
- Replace with a single catch-all route that serves `dist/index.html`
- Mount `dist/` (Vite build output) as static files
- Existing `/api/*` routes remain unchanged
- CORS: in development, allow `http://localhost:5173` (Vite dev server)
- Session cookie `samesite` stays `lax`, `secure` in production

## Authentication
Current auth uses httpOnly session cookies. This is preserved exactly — React
reads auth state from a `/api/auth/me` endpoint on startup and stores it in
Zustand. No JWT migration required.

## Migration Phases

### Phase 1 — Scaffold & Infrastructure
- Init Vite + React + TypeScript project in `src/frontend/`
- Configure Tailwind + DaisyUI for React
- Set up React Router with all routes mirroring current URLs (no broken links)
- Set up TanStack Query client + Zustand auth store
- Set up `/api/auth/me` endpoint in FastAPI
- Wire catch-all route in FastAPI to serve `dist/index.html`
- Update `Dockerfile` to build Vite in the Node stage
- Update `docker-compose.yml` dev command to proxy API to FastAPI, serve React via Vite HMR
- Update CI to run `npm run build` (Vite) instead of `npm run css`
- **Exit criteria:** blank React app loads at `localhost:8000`, all API routes still work

### Phase 2 — Layout, Auth & Navigation
- Migrate Navbar partial → `components/Navbar.tsx`
- Migrate Footer partial → `components/Footer.tsx`
- Migrate auth modal → `components/AuthModal.tsx`
- Implement auth Zustand store (`useAuthStore`) with login/logout/register actions
- Migrate Home page and Games listing page
- **Exit criteria:** user can log in, log out, register, and navigate all non-game pages

### Phase 3 — Game Pages (one per PR)
Migrate each game independently. Each game gets:
- `games/<name>/<Name>Page.tsx` — layout and controls
- `games/<name>/use<Name>Game.ts` — Zustand store or hook for game state
- Port canvas/DOM logic from existing JS file into React hooks

Order (simplest to most complex):
1. Tic-Tac-Toe
2. Connect 4
3. Pong
4. Dots and Boxes
5. Checkers
6. Chess

- **Exit criteria per game:** game plays end-to-end, AI moves work, existing Playwright game tests pass

### Phase 4 — Profile, Settings & Cleanup
- Migrate Profile and Settings pages
- Delete all Jinja2 templates and `src/frontend/public/js/` (except images)
- Remove Jinja2 dependencies from FastAPI (`python-multipart`, `jinja2` if unused)
- Remove unused npm packages (`ejs`, `express`, `express-session`, etc.)
- **Exit criteria:** no dead code, all tests green, Docker build passes

## Test Strategy
| Tier | What | Notes |
|------|------|-------|
| Unit | Zustand store logic, pure game logic functions | Jest, stays in `tests/unit/` |
| API integration | All `/api/*` endpoints | Playwright API tests, unchanged |
| E2E | Auth flow, each game page loads and renders | Playwright, update selectors |
| Manual | Full game playthrough for each game | Document in manual checklist below |

### Test Cases
- `unit/auth-store.test.ts` — login sets user, logout clears user, unauthenticated state
- `unit/game-logic/*.test.ts` — one per game, port existing unit tests to TypeScript
- `api/auth.spec.ts` — register, login, logout, /me endpoint (existing, unchanged)
- `api/games.spec.ts` — game state endpoints (existing, unchanged)
- `e2e/navigation.spec.ts` — all routes render without 404
- `e2e/auth-flow.spec.ts` — full register → login → logout flow
- `e2e/game-<name>.spec.ts` — page loads, move can be made, game ends correctly (one per game)
- **Manual:** play each game to completion as a logged-in and logged-out user

## Open Questions / Risks
- Chess AI is 39KB of complex minimax logic — port carefully, consider moving to backend
- Pong has a continuous game loop (requestAnimationFrame) — needs `useEffect` cleanup to avoid memory leaks in React strict mode
- Google OAuth redirect URI must be updated to point to the React frontend route after migration
