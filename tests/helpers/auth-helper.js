const fs = require('fs');
const path = require('path');

/**
 * Get the shared authentication data from global setup
 */
function getGlobalAuth() {
    const authFile = path.join(__dirname, '../test-auth-data.json');

    if (!fs.existsSync(authFile)) {
        throw new Error('Authentication data not found. Global setup may have failed.');
    }

    const authData = JSON.parse(fs.readFileSync(authFile, 'utf8'));
    return authData;
}

/**
 * Get CSRF token for requests that need it
 */
async function getCsrfToken(request) {
    const response = await request.get('/api/csrf-token');
    if (!response.ok()) {
        throw new Error(`CSRF token request failed: ${response.status()}`);
    }
    const data = await response.json();
    return data.csrfToken;
}

/**
 * Create request context with proper cookie handling
 */
async function createAuthenticatedContext(request) {
    const authData = getGlobalAuth();

    // Create a new context with cookies
    const context = await request.newContext({
        // Set cookies from the global auth
        storageState: {
            cookies: authData.cookies,
            origins: []
        }
    });

    return context;
}

/**
 * Add authentication headers to any request
 * Use this in your API tests: addAuth(request).get('/api/endpoint')
 */
function addAuth(request) {
    const authData = getGlobalAuth();

    return {
        get: async (url, options = {}) => {
            // For cookie-based auth, we need to include cookies
            const headers = {
                'Cookie': authData.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
                ...options.headers
            };

            console.log(`Making GET request to: ${url}`);
            console.log(`Headers:`, headers);

            return request.get(url, {
                ...options,
                headers
            });
        },

        post: async (url, options = {}) => {
            // Get CSRF token for POST requests
            let headers = {
                'Cookie': authData.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
                'Content-Type': 'application/json',  // Ensure JSON content type
                ...(options.headers || {})  // Handle undefined options.headers
            };

            // Add CSRF token if not already present
            if (!headers['X-CSRF-Token'] && !headers['x-csrf-token']) {
                try {
                    const csrfToken = await getCsrfToken(request);
                    headers['X-CSRF-Token'] = csrfToken;
                } catch (error) {
                    console.warn('Could not get CSRF token:', error.message);
                }
            }

            // Ensure data is properly structured for Playwright
            const requestOptions = {
                ...options,
                headers
            };

            const response = await request.post(url, requestOptions);
            if (!response.ok()) {
                console.error(`Request failed with status ${response.status()}`);
                const responseText = await response.text().catch(() => 'Could not read response text');
                console.error(`Response body:`, responseText);
            }

            return response;
        },

        put: async (url, options = {}) => {
            let headers = {
                'Cookie': authData.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
                ...options.headers
            };

            if (!headers['X-CSRF-Token'] && !headers['x-csrf-token']) {
                try {
                    const csrfToken = await getCsrfToken(request);
                    headers['X-CSRF-Token'] = csrfToken;
                } catch (error) {
                    console.warn('Could not get CSRF token:', error.message);
                }
            }

            return request.put(url, {
                ...options,
                headers
            });
        },

        delete: async (url, options = {}) => {
            let headers = {
                'Cookie': authData.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
                ...options.headers
            };

            if (!headers['X-CSRF-Token'] && !headers['x-csrf-token']) {
                try {
                    const csrfToken = await getCsrfToken(request);
                    headers['X-CSRF-Token'] = csrfToken;
                } catch (error) {
                    console.warn('Could not get CSRF token:', error.message);
                }
            }

            return request.delete(url, {
                ...options,
                headers
            });
        },

        patch: async (url, options = {}) => {
            let headers = {
                'Cookie': authData.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
                ...options.headers
            };

            if (!headers['X-CSRF-Token'] && !headers['x-csrf-token']) {
                try {
                    const csrfToken = await getCsrfToken(request);
                    headers['X-CSRF-Token'] = csrfToken;
                } catch (error) {
                    console.warn('Could not get CSRF token:', error.message);
                }
            }

            return request.patch(url, {
                ...options,
                headers
            });
        }
    };
}

/**
 * Get just the session ID for manual header addition
 */
function getSessionId() {
    const authData = getGlobalAuth();
    return authData.sessionId;
}

/**
 * Create a test user for registration tests
 */
function createTestUser() {
    const timestamp = Date.now();
    return {
        username: `testuser${timestamp}`,
        email: `test${timestamp}@example.com`,
        password: 'password123',
        displayName: `Test User ${timestamp}`
    };
}

module.exports = {
    addAuth,
    getSessionId,
    createTestUser,
    getCsrfToken,
    createAuthenticatedContext
};