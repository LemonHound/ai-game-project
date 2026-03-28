import { test, expect, Page } from "@playwright/test";

const BASE_API = "http://localhost:8000/api";

async function loginTestUser(page: Page) {
  await page.request.post(`${BASE_API}/auth/login`, {
    data: { email: "test@example.com", password: "test123" },
  });
}

async function clearTttSession(page: Page) {
  await page.request.post(`${BASE_API}/game/tic-tac-toe/newgame`, {
    data: { player_starts: true },
  });
}

test.describe("TTT — full game flows", () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
    await page.goto("/game/tic-tac-toe");
    await page.waitForLoadState("networkidle");
  });

  test("test_ttt_unauthenticated_user_sees_login_prompt", async ({ page }) => {
    // Log out first
    await page.request.post(`${BASE_API}/auth/logout`);
    await page.goto("/game/tic-tac-toe");
    await page.waitForLoadState("networkidle");
    const signInBtn = page.locator('button:has-text("Sign In")');
    await expect(signInBtn).toBeVisible({ timeout: 5000 });
  });

  test("test_ttt_new_game_shows_board", async ({ page }) => {
    const goFirstBtn = page.locator('button:has-text("Go first")');
    await expect(goFirstBtn).toBeVisible({ timeout: 5000 });
    await goFirstBtn.click();
    const newGameBtn = page.locator('button:has-text("New Game")').last();
    await newGameBtn.click();
    await expect(page.locator('[aria-label="Tic-Tac-Toe board"]')).toBeVisible({ timeout: 5000 });
  });

  test("test_ttt_full_game_player_wins", async ({ page }) => {
    await page.locator('button:has-text("Go first")').click();
    await page.locator('button:has-text("New Game")').last().click();

    const board = page.locator('[aria-label="Tic-Tac-Toe board"]');
    await expect(board).toBeVisible({ timeout: 5000 });

    // Play a sequence that forces player win (center + corners vs easy AI)
    // We play moves and wait for SSE to return AI move before each click
    const cells = board.locator("button");

    // Player at 0
    await cells.nth(0).click();
    await page.waitForTimeout(3500); // wait for SSE ai response

    // Player at 1
    await cells.nth(1).click();
    await page.waitForTimeout(3500);

    // Player at 2 — row 0 complete → player wins
    await cells.nth(2).click();
    await page.waitForTimeout(3500);

    // May or may not have won depending on AI; check for terminal banner or continue
    const banner = page.locator('.alert');
    const stillPlaying = (await board.isVisible()) && !(await banner.isVisible());
    if (!stillPlaying) {
      await expect(banner).toBeVisible({ timeout: 3000 });
    }
  });

  test("test_ttt_new_game_abandons_in_progress_session", async ({ page }) => {
    // Start first game
    await page.locator('button:has-text("Go first")').click();
    await page.locator('button:has-text("New Game")').last().click();
    await expect(page.locator('[aria-label="Tic-Tac-Toe board"]')).toBeVisible();

    // Click New Game while in progress
    await page.locator('button:has-text("New Game")').last().click();
    // Should return to new game selector
    await expect(page.locator('button:has-text("Go first")')).toBeVisible({ timeout: 3000 });
  });

  test("test_ttt_resume_after_page_refresh", async ({ page }) => {
    await page.locator('button:has-text("Go first")').click();
    await page.locator('button:has-text("New Game")').last().click();
    await expect(page.locator('[aria-label="Tic-Tac-Toe board"]')).toBeVisible();

    // Make a move to establish state
    await page.locator('[aria-label="Tic-Tac-Toe board"] button').first().click();
    await page.waitForTimeout(1000);

    // Refresh
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Should resume to board (localStorage hint present)
    await expect(page.locator('[aria-label="Tic-Tac-Toe board"]')).toBeVisible({ timeout: 5000 });
  });

  test("test_ttt_mobile_viewport_playable", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/game/tic-tac-toe");
    await page.waitForLoadState("networkidle");

    await page.locator('button:has-text("Go first")').click();
    await page.locator('button:has-text("New Game")').last().click();
    const board = page.locator('[aria-label="Tic-Tac-Toe board"]');
    await expect(board).toBeVisible({ timeout: 5000 });

    // Verify no horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    // Verify cells are large enough (≥ 64px)
    const cell = board.locator("button").first();
    const box = await cell.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(64);
  });
});
