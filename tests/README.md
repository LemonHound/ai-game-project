# Testing Guide

This project uses **Playwright** for end-to-end testing and **Jest** for unit testing.

## Test Structure

```
tests/
├── api/              # API endpoint tests
├── auth/             # Authentication flow tests
├── e2e/              # End-to-end navigation tests
├── games/            # Game interaction tests
├── helpers/          # Test utilities and helpers
├── performance/      # Performance tests
├── smoke/            # Quick smoke tests
├── unit/             # Unit tests (Jest)
├── global-setup.js   # Global test setup
└── README.md         # This file
```

## Available Test Commands

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only Playwright E2E tests
npm run test:e2e

# Run Playwright tests with browser visible
npm run test:e2e:headed

# Run Playwright tests in debug mode
npm run test:e2e:debug

# Run specific test categories
npm run test:smoke      # Quick smoke tests
npm run test:games      # Game functionality tests
npm run test:auth       # Authentication tests

# Run everything including performance
npm run test:all
```

## Test Categories

### 🚀 Smoke Tests (`tests/smoke/`)
Quick tests to verify basic functionality:
- All routes load correctly
- API endpoints respond
- Database connection works
- No critical JavaScript errors

### 🎮 Game Tests (`tests/games/`)
Interactive game functionality:
- Game boards load and are interactive
- Player moves work correctly
- AI responses function
- Game controls (restart, hints) work
- Game state updates properly

### 🔐 Auth Tests (`tests/auth/`)
Authentication flow testing:
- Login/logout functionality
- Registration process
- Session management
- API authentication

### 🌐 Navigation Tests (`tests/e2e/`)
Site navigation and user flows:
- Menu navigation works
- Links function correctly
- Mobile responsive navigation
- Breadcrumbs and back buttons
- 404 error handling

### 📡 API Tests (`tests/api/`)
Backend API endpoint testing:
- Health checks
- Game data endpoints
- Authentication endpoints
- Error handling
- CORS configuration

### ⚡ Performance Tests (`tests/performance/`)
Performance and load time testing:
- Page load times
- Asset loading efficiency
- API response times
- Game interaction responsiveness

## Running Tests Locally

### Prerequisites
1. Make sure your server is running: `npm run dev`
2. Database should be set up and accessible

### Run Specific Tests
```bash
# Run only route smoke tests
npx playwright test tests/smoke/routes.spec.js

# Run only tic-tac-toe game tests
npx playwright test tests/games/game-interactions.spec.js --grep "Tic Tac Toe"

# Run auth tests in headed mode
npx playwright test tests/auth/auth-flow.spec.js --headed

# Run with specific browser
npx playwright test --project=chromium

# Run mobile tests
npx playwright test --project="Mobile Chrome"
```

### Debug Tests
```bash
# Debug mode - opens browser with dev tools
npx playwright test --debug

# Debug specific test
npx playwright test tests/games/game-interactions.spec.js --debug

# Generate trace for debugging
npx playwright test --trace on
```

## Test Configuration

### Playwright Config (`playwright.config.js`)
- Tests run against `http://localhost:3000`
- Automatically starts/stops server
- Supports multiple browsers (Chrome, Firefox, Safari)
- Includes mobile viewport testing
- Generates HTML reports and traces

### Jest Config (`jest.config.js`)
- Unit tests only in `tests/unit/` directory
- 10 second timeout for database tests
- Coverage reporting enabled

## Test Helpers

The `tests/helpers/test-utils.js` file contains useful helper functions:

```javascript
const { loginWithDemo, makeTicTacToeMove, waitForGameLoad } = require('./helpers/test-utils');

// Login with demo credentials
await loginWithDemo(page);

// Wait for a game to load completely
await waitForGameLoad(page, 'tic-tac-toe');

// Make a move in tic-tac-toe
await makeTicTacToeMove(page, 0); // Click first square
```

## CI/CD Integration

Tests are configured to run in GitHub Actions with:
- Retry on failure
- Video recording on failure
- Screenshot capture on failure
- Test result artifacts
- Multiple browser testing

## Writing New Tests

### Game Tests Example
```javascript
test('new game functionality', async ({ page }) => {
  await waitForGameLoad(page, 'my-new-game');
  
  // Test game-specific functionality
  const gameBoard = page.locator('#game-board');
  await expect(gameBoard).toBeVisible();
  
  // Make moves, test interactions
  await page.locator('.game-piece').first().click();
  await page.waitForTimeout(500);
  
  // Verify game state
  await expect(page.locator('.game-status')).toContainText('Player moved');
});
```

### API Tests Example
```javascript
test('new API endpoint', async ({ request }) => {
  const response = await request.get('/api/my-endpoint');
  
  expect(response.ok()).toBeTruthy();
  
  const data = await response.json();
  expect(data).toHaveProperty('expectedField');
});
```

## Troubleshooting

### Common Issues

1. **Tests fail with "Server not running"**
    - Make sure `npm run start` works locally
    - Check that port 3000 is available

2. **Game tests fail intermittently**
    - Add `await page.waitForTimeout()` after interactions
    - Use `waitForLoadState('networkidle')` for dynamic content

3. **Authentication tests fail**
    - Verify demo credentials in `src/backend/routes/auth.js`
    - Check that mock users exist

4. **Database tests fail**
    - Ensure database is running and accessible
    - Check environment variables in `.env`

### Debug Mode
Run tests in debug mode to step through failures:
```bash
npx playwright test --debug tests/failing-test.spec.js
```

### Test Reports
After running tests, view the HTML report:
```bash
npx playwright show-report
```

## Best Practices

1. **Use data attributes** for stable selectors:
   ```html
   <button data-testid="start-game">Start Game</button>
   ```

2. **Wait for network idle** after navigation:
   ```javascript
   await page.goto('/games');
   await page.waitForLoadState('networkidle');
   ```

3. **Test error scenarios** not just happy paths

4. **Keep tests independent** - each test should work in isolation

5. **Use descriptive test names** that explain what's being tested

6. **Group related tests** using `test.describe()` blocks