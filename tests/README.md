# Testing Guide

This project uses **Playwright** for end-to-end, API, and smoke testing, and **Jest** for unit testing.

## Prerequisites

The backend and database must be running before executing Playwright tests:

```bash
docker compose up -d
```

Test users are seeded automatically. See the main README for credentials.

---

## Test Structure

```
tests/
├── api/              # API endpoint tests (Playwright request fixtures)
├── auth/             # Authentication flow tests
├── e2e/              # Navigation and routing tests
├── games/            # Game interaction tests
├── helpers/          # Shared test utilities
├── performance/      # Performance benchmarks
├── smoke/            # Quick health-check tests
├── unit/             # Unit tests (Jest)
└── global-setup.js   # Global Playwright setup
```

---

## Test Commands

```bash
# Unit tests (Jest, no server required)
npm run test:unit

# All Playwright tests
npm run test:e2e

# Specific categories
npm run test:smoke        # quick health checks
npm run test:auth         # login, register, logout, OAuth
npm run test:games        # game board interactions and AI responses
npm run test:api          # API endpoint contracts

# Headed mode (opens browser)
npm run test:e2e:headed

# Debug mode
npm run test:e2e:debug

# Run everything
npm test
```

---

## Test Categories

### Smoke (`tests/smoke/`)
Fast sanity checks — all routes load, API responds, DB connected, no console errors.

### Auth (`tests/auth/`)
Registration, login, logout, session persistence, Google OAuth redirect.

### Games (`tests/games/`)
Game boards render and are interactive, player moves are accepted, AI responds, game-over states fire correctly.

### API (`tests/api/`)
HTTP contracts for all backend endpoints: status codes, response shapes, error handling, CORS.

### Navigation / E2E (`tests/e2e/`)
React Router routes resolve, navbar links work, 404 handling, mobile viewports.

### Performance (`tests/performance/`)
Page load times, API response times, game interaction latency.

### Unit (`tests/unit/`)
Pure logic — Zustand stores, utility functions, React component rendering (no server required).

---

## Running Individual Tests

```bash
# Single spec file
npx playwright test tests/smoke/routes.spec.js

# Filter by test name
npx playwright test --grep "Tic Tac Toe"

# Specific browser
npx playwright test --project=chromium

# With trace recording
npx playwright test --trace on
```

---

## Debugging Failures

```bash
# Open Playwright inspector
npx playwright test --debug tests/failing-test.spec.js

# View HTML report after a run
npx playwright show-report
```

Playwright saves screenshots and videos on failure as CI artifacts.

---

## Test Helpers (`tests/helpers/`)

```javascript
const { loginAs, waitForGameLoad } = require('./helpers/test-utils');

await loginAs(page, 'demo');
await waitForGameLoad(page, 'tic-tac-toe');
```

---

## Writing New Tests

Use `data-testid` attributes for stable selectors:

```tsx
<button data-testid="start-game">Start Game</button>
```

```javascript
test('game starts on button click', async ({ page }) => {
  await page.goto('/game/tic-tac-toe');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('game-board')).toBeVisible();
});
```

Keep tests independent — each test should be able to run in isolation without relying on state from another test.

---

## CI Integration

All tests run in GitHub Actions on every push and pull request to `main`. The pipeline runs:

1. Code quality (Prettier, npm audit)
2. Unit tests with coverage upload
3. Smoke, auth, games, API, navigation, performance tests (parallel)
4. Cross-browser tests on Firefox and WebKit (main branch only)
