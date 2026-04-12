const { defineConfig, devices } = require('@playwright/test');

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
    testDir: './tests',
    /* Only include Playwright test files, exclude Jest tests */
    testMatch: [
        '**/tests/api/**/*.spec.{js,ts}',
        '**/tests/auth/**/*.spec.js',
        '**/tests/database/**/*.spec.js',
        '**/tests/e2e/**/*.spec.{js,ts}',
        '**/tests/games/**/*.spec.js',
        '**/tests/performance/**/*.spec.js',
        '**/tests/smoke/**/*.spec.js',
    ],
    /* Ignore Jest test files */
    testIgnore: ['**/tests/unit/**/*'],
    /* Run tests in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Opt out of parallel tests on CI. */
    workers: process.env.CI ? 1 : undefined,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: [
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['junit', { outputFile: 'test-results/results.xml' }],
        ['list'],
    ],
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: process.env.BASE_URL || 'http://localhost:8000',

        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',

        /* Take screenshot on failure */
        screenshot: 'only-on-failure',

        /* Record video on failure */
        video: 'retain-on-failure',
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },

        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },

        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },

        /* Test against mobile viewports. */
        /* Disabling until the mobile-friendly site is developed
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
       */
    ],

    /* Run your local dev server before starting the tests.
     * Skipped when BASE_URL points to a non-localhost host (e.g. post-deploy smoke run). */
    webServer: (() => {
        const base = process.env.BASE_URL || '';
        if (base && !base.includes('localhost') && !base.includes('127.0.0.1')) {
            return undefined;
        }
        return {
            command: 'bash -c "cd src/backend && python -m uvicorn app:app --host 0.0.0.0 --port 8000"',
            url: 'http://localhost:8000',
            reuseExistingServer: !process.env.CI,
            timeout: 120 * 1000,
            env: {
                NODE_ENV: 'test',
                PORT: '8000',
            },
        };
    })(),
});
