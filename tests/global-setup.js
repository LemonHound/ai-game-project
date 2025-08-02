// tests/global-setup.js
const { chromium } = require('@playwright/test');

/**
 * Global setup for Playwright tests
 * This runs once before all tests and sets up shared authentication
 */
async function globalSetup() {
  console.log('🔧 Setting up global test environment...');

  // Launch browser for authentication setup
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to login page
    await page.goto('http://localhost:3000');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Get CSRF token first
    const csrfResponse = await page.request.get(
      'http://localhost:3000/api/csrf-token'
    );
    if (!csrfResponse.ok()) {
      throw new Error(`CSRF token request failed: ${csrfResponse.status()}`);
    }
    const csrfData = await csrfResponse.json();
    const csrfToken = csrfData.csrfToken;

    // Perform login to get session
    const response = await page.request.post(
      'http://localhost:3000/api/auth/login',
      {
        data: {
          email: 'demo@aigamehub.com',
          password: 'password123',
        },
        headers: {
          'X-CSRF-Token': csrfToken,
        },
      }
    );

    if (!response.ok()) {
      throw new Error(`Login failed: ${response.status()}`);
    }

    const loginData = await response.json();

    // Get session ID from cookies since your API uses cookie-based auth
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name === 'sessionId');

    if (!sessionCookie) {
      throw new Error('No session cookie found after login');
    }

    // Store authentication data in a global file for tests to use
    const fs = require('fs');
    const path = require('path');

    const authData = {
      sessionId: sessionCookie.value,
      user: loginData.user,
      cookies: cookies,
      timestamp: Date.now(),
    };

    // Save auth data to a file that tests can read
    const authFile = path.join(__dirname, 'test-auth-data.json');
    fs.writeFileSync(authFile, JSON.stringify(authData, null, 2));

    console.log('✅ Global authentication setup complete');
    console.log(`📝 Session ID: ${sessionCookie.value}`);
    console.log(`👤 User: ${loginData.user.email}`);
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

module.exports = globalSetup;
