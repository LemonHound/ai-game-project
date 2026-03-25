const fs = require('fs');
const path = require('path');

/**
 * Create a fresh authenticated session
 */
async function createFreshAuth(request) {
    // Get CSRF token
    const csrfResponse = await request.get('/api/auth/csrf-token');
    if (!csrfResponse.ok()) {
        throw new Error(`CSRF token request failed: ${csrfResponse.status()}`);
    }
    const csrfData = await csrfResponse.json();
    const csrfCookies = csrfResponse.headers()['set-cookie'];

    // Login to get fresh session
    const loginResponse = await request.post('/api/auth/login', {
        data: {
            email: 'demo@aigamehub.com',
            password: 'demo123',
        },
        headers: {
            'X-CSRF-Token': csrfData.csrfToken,
            Cookie: csrfCookies ? csrfCookies.split(';')[0] : '',
        },
    });

    if (!loginResponse.ok()) {
        const errorText = await loginResponse.text();
        throw new Error(`Fresh auth failed: ${loginResponse.status()} - ${errorText}`);
    }

    // Extract session cookie
    const cookies = loginResponse.headers()['set-cookie'];
    const sessionMatch = cookies.match(/sessionId=([^;]+)/);

    if (!sessionMatch) {
        throw new Error('No session cookie in fresh auth response');
    }

    return {
        sessionId: sessionMatch[1],
        sessionCookie: { name: 'sessionId', value: sessionMatch[1] },
    };
}

/**
 * Get CSRF token with session cookie
 */
async function getCsrfToken(request, sessionCookie = null) {
    const headers = {};
    if (sessionCookie) {
        headers.Cookie = `${sessionCookie.name}=${sessionCookie.value}`;
    }

    const response = await request.get('/api/auth/csrf-token', { headers });
    if (!response.ok()) {
        throw new Error(`CSRF token request failed: ${response.status()}`);
    }
    const data = await response.json();

    const cookies = response.headers()['set-cookie'];
    return {
        token: data.csrfToken,
        cookies: cookies,
    };
}

/**
 * Create an authenticated request helper
 */
function addAuth(request) {
    // Each addAuth call creates its own session
    let authSession = null;

    const ensureAuth = async () => {
        if (!authSession) {
            authSession = await createFreshAuth(request);
        }
        return authSession;
    };

    return {
        get: async (url, options = {}) => {
            const session = await ensureAuth();

            const headers = {
                Cookie: `${session.sessionCookie.name}=${session.sessionCookie.value}`,
                ...options.headers,
            };

            const response = await request.get(url, {
                ...options,
                headers,
            });

            return response;
        },

        post: async (url, options = {}) => {
            const session = await ensureAuth();

            let csrfData;
            try {
                csrfData = await getCsrfToken(request, session.sessionCookie);
            } catch (error) {
                throw error;
            }

            let allCookies = `${session.sessionCookie.name}=${session.sessionCookie.value}`;

            if (csrfData.cookies) {
                const csrfCookieValue = csrfData.cookies.split(';')[0];
                allCookies += '; ' + csrfCookieValue;
            }

            const headers = {
                Cookie: allCookies,
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfData.token,
                ...(options.headers || {}),
            };

            return request.post(url, {
                ...options,
                headers,
            });
        },

        put: async (url, options = {}) => {
            const session = await ensureAuth();

            let csrfData;
            try {
                csrfData = await getCsrfToken(request, session.sessionCookie);
            } catch (error) {
                throw error;
            }

            let allCookies = `${session.sessionCookie.name}=${session.sessionCookie.value}`;

            if (csrfData.cookies) {
                const csrfCookieValue = csrfData.cookies.split(';')[0];
                allCookies += '; ' + csrfCookieValue;
            }

            const headers = {
                Cookie: allCookies,
                'X-CSRF-Token': csrfData.token,
                ...options.headers,
            };

            return request.put(url, {
                ...options,
                headers,
            });
        },

        delete: async (url, options = {}) => {
            const session = await ensureAuth();

            let csrfData;
            try {
                csrfData = await getCsrfToken(request, session.sessionCookie);
            } catch (error) {
                throw error;
            }

            let allCookies = `${session.sessionCookie.name}=${session.sessionCookie.value}`;

            if (csrfData.cookies) {
                const csrfCookieValue = csrfData.cookies.split(';')[0];
                allCookies += '; ' + csrfCookieValue;
            }

            const headers = {
                Cookie: allCookies,
                'X-CSRF-Token': csrfData.token,
                ...options.headers,
            };

            return request.delete(url, {
                ...options,
                headers,
            });
        },

        patch: async (url, options = {}) => {
            const session = await ensureAuth();

            let csrfData;
            try {
                csrfData = await getCsrfToken(request, session.sessionCookie);
            } catch (error) {
                throw error;
            }

            let allCookies = `${session.sessionCookie.name}=${session.sessionCookie.value}`;

            if (csrfData.cookies) {
                const csrfCookieValue = csrfData.cookies.split(';')[0];
                allCookies += '; ' + csrfCookieValue;
            }

            const headers = {
                Cookie: allCookies,
                'X-CSRF-Token': csrfData.token,
                ...options.headers,
            };

            return request.patch(url, {
                ...options,
                headers,
            });
        },
    };
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
        displayName: `Test User ${timestamp}`,
    };
}

module.exports = {
    addAuth,
    createTestUser,
    getCsrfToken,
    createFreshAuth,
};
