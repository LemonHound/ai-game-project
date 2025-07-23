// Configuration for routes that require authentication
const authConfig = {
    // Routes that NEVER require authentication (always public)
    publicRoutes: [
        '/api/csrf-token',
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/logout',
        '/api/auth/google',
        '/api/auth/google/callback',
        '/api/health',
        '/api/test-db',
        '/api/games'
    ],

    // Path patterns that require authentication for ALL routes within them
    protectedPaths: [
        '/api/game',  // All game operations require auth except info
        '/api/ai'     // All AI operations require auth
    ],

    // Specific routes that require authentication
    protectedRoutes: [
        '/api/auth/me',
        '/api/auth/stats'
    ],

    // Special exceptions within protected paths (public routes within protected paths)
    protectedPathExceptions: [
        '/api/game/*/info'  // Game info can be public even though /api/game is protected
    ]
};

// Authentication middleware - validates sessions but doesn't block
const authMiddleware = async (req, res, next) => {
    const sessionId = req.cookies?.sessionId || req.headers['x-session-id'];

    if (sessionId) {
        try {
            // Try database first
            const pool = require('../../shared/database/connection');
            const result = await pool.query(`SELECT u.*, s.expires_at 
                FROM users u 
                JOIN user_sessions s ON u.id = s.user_id 
                WHERE s.session_id = $1 AND s.expires_at > NOW()
            `, [sessionId]);

            if (result.rows.length > 0) {
                req.user = result.rows[0];
                req.isAuthenticated = true;
            }
        } catch (error) {
            console.error('Auth middleware error, checking fallback:', error);
            // Fallback to in-memory (for development/testing)
            // This should match the fallback logic in auth.js
        }
    }

    req.isAuthenticated = req.isAuthenticated || false;
    next();
};

// Authentication requirement middleware - blocks unauthenticated requests
const requireAuth = (req, res, next) => {
    if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
};

// Helper function to check if a route should require authentication
function shouldRequireAuth(path) {
    // Check if it's explicitly public
    for (const publicRoute of authConfig.publicRoutes) {
        if (publicRoute.includes('*')) {
            // Handle wildcard patterns
            const pattern = publicRoute.replace(/\*/g, '[^/]+');
            const regex = new RegExp(`^${pattern}$`);
            if (regex.test(path)) {
                return false;
            }
        } else if (path === publicRoute) {
            return false;
        }
    }

    // Check if it matches a protected path pattern
    for (const protectedPath of authConfig.protectedPaths) {
        if (path.startsWith(protectedPath)) {
            // Check for exceptions within protected paths
            for (const exception of authConfig.protectedPathExceptions) {
                if (exception.includes('*')) {
                    const pattern = exception.replace(/\*/g, '[^/]+');
                    const regex = new RegExp(`^${pattern}$`);
                    if (regex.test(path)) {
                        return false; // This is an exception, don't require auth
                    }
                } else if (path === exception) {
                    return false;
                }
            }
            return true; // Requires auth (no exception found)
        }
    }

    // Check specific protected routes
    if (authConfig.protectedRoutes.includes(path)) {
        return true;
    }

    return false; // Default to public
}

// Dynamic authentication middleware that applies to specific routes
const dynamicAuthMiddleware = (req, res, next) => {
    if (shouldRequireAuth(req.path)) {
        return requireAuth(req, res, next);
    }
    next();
};

// Utility function to add new protected routes (for easy maintenance)
function addProtectedRoute(route) {
    if (!authConfig.protectedRoutes.includes(route)) {
        authConfig.protectedRoutes.push(route);
    }
}

// Utility function to add new protected path
function addProtectedPath(path) {
    if (!authConfig.protectedPaths.includes(path)) {
        authConfig.protectedPaths.push(path);
    }
}

// Utility function to add new public route
function addPublicRoute(route) {
    if (!authConfig.publicRoutes.includes(route)) {
        authConfig.publicRoutes.push(route);
    }
}

module.exports = {
    authMiddleware,
    requireAuth,
    dynamicAuthMiddleware,
    authConfig,
    shouldRequireAuth,
    addProtectedRoute,
    addProtectedPath,
    addPublicRoute
};