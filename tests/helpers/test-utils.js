const { expect } = require('@playwright/test');

async function loginWithDemo(page) {
  await page.click('[data-testid="navbar-login-btn"]', { force: true });
  await expect(page.locator('#login-modal.modal-open')).toBeVisible();

  await page.fill('#login-email', 'demo@aigamehub.com');
  await page.fill('#login-password', 'password123');
  await page.click('[data-testid="login-submit-btn"]');

  await expect(page.locator('#auth-logged-in')).toBeVisible();
}

async function logoutUser(page) {
  await page.click('.dropdown .avatar');
  await page.click('text=Logout');
  await expect(page.locator('#auth-not-logged-in')).toBeVisible();
}

async function waitForGameLoad(page, gameId) {
  await page.waitForLoadState('networkidle');

  switch (gameId) {
    case 'tic-tac-toe':
      await expect(page.locator('#tic-tac-toe-board')).toBeVisible();
      break;
    case 'connect4':
      await expect(page.locator('#connect4-board')).toBeVisible();
      break;
    case 'dots-and-boxes':
      await expect(page.locator('#dots-and-boxes-board')).toBeVisible();
      break;
    default:
      await expect(page.locator('[class*="game"]')).toBeVisible();
  }
}

async function makeTicTacToeMove(page, position) {
  await page.click(`.game-square[data-position="${position}"]`);
}

function generateTestUser() {
  const timestamp = Date.now();
  return {
    username: `testuser${timestamp}`,
    email: `test${timestamp}@example.com`,
    password: 'password123',
    displayName: `Test User ${timestamp}`,
  };
}

function verifyApiResponse(data, requiredFields) {
  expect(data).toBeDefined();
  for (const field of requiredFields) {
    expect(data).toHaveProperty(field);
  }
}

module.exports = {
  loginWithDemo,
  logoutUser,
  waitForGameLoad,
  makeTicTacToeMove,
  generateTestUser,
  verifyApiResponse,
};
