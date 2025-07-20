const express = require('express');
const bcrypt = require('bcrypt');
const { OAuth2Client } = require('google-auth-library');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Database connection
let pool;
try {
    pool = require('../../shared/database/connection');
} catch (error) {
    console.warn('Database connection not available:', error.message);
    pool = null;
}

// Initialize Google OAuth client (only if configured)
let googleClient = null;
if (process.env.GOOGLE_CLIENT_ID) {
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
}

// Fallback to in-memory sessions if database is not available
const fallbackSessions = new Map();
const fallbackUsers = [
    {
        id: 1,
        username: 'demo',
        email: 'demo@aigamehub.com',
        display_name: 'Demo Player',
        password_hash: '$2b$12$5hKQbDKdI6IaN9VJq8.4TOr4lAgOVGhzVyywtdhJMcGff8mFJK8V2', // password123
        auth_provider: 'local',
        created_at: new Date(),
        last_login: new Date()
    },
    {
        id: 2,
        username: 'test',
        email: 'test@example.com',
        display_name: 'Test User',
        password_hash: '$2b$12$5hKQbDKdI6IaN9VJq8.4TOr4lAgOVGhzVyywtdhJMcGff8mFJK8V2', // password123
        auth_provider: 'local',
        created_at: new Date(),
        last_login: new Date()
    }
];

// Helper functions
async function createUserSession(userId) {
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    if (pool) {
        try {
            await pool.query(
                'INSERT INTO user_sessions (session_id, user_id, expires_at) VALUES ($1, $2, $3)',
                [sessionId, userId, expiresAt]
            );
        } catch (error) {
            console.error('Error creating session in database:', error.message);
            // Fall back to memory
            fallbackSessions.set(sessionId, { userId, expiresAt });
        }
    } else {
        fallbackSessions.set(sessionId, { userId, expiresAt });
    }

    return sessionId;
}

async function getUserBySession(sessionId) {
    if (pool) {
        try {
            const result = await pool.query(`
                SELECT u.*, s.expires_at 
                FROM users u 
                JOIN user_sessions s ON u.id = s.user_id 
                WHERE s.session_id = $1 AND s.expires_at > NOW()
            `, [sessionId]);

            return result.rows[0] || null;
        } catch (error) {
            console.error('Error getting user by session:', error.message);
            // Fall back to memory
            const session = fallbackSessions.get(sessionId);
            if (session && session.expiresAt > new Date()) {
                return fallbackUsers.find(u => u.id === session.userId) || null;
            }
            return null;
        }
    } else {
        const session = fallbackSessions.get(sessionId);
        if (session && session.expiresAt > new Date()) {
            return fallbackUsers.find(u => u.id === session.userId) || null;
        }
        return null;
    }
}

async function findUserByEmail(email) {
    if (pool) {
        try {
            console.log('=== FINDUSERBEEMAIL DEBUG ===');
            console.log('Looking for email:', email);

            // First, let's see what columns actually exist
            const columnsResult = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'users' 
                ORDER BY ordinal_position
            `);
            console.log('Available columns:', columnsResult.rows.map(r => r.column_name));

            // Try a simple query first
            const simpleResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
            console.log('Simple query result:', simpleResult.rows[0]);

            return simpleResult.rows[0] || null;
        } catch (error) {
            console.error('Error finding user by email:', error.message);
            console.error('Full error:', error);
            return fallbackUsers.find(u => u.email === email) || null;
        }
    } else {
        return fallbackUsers.find(u => u.email === email) || null;
    }
}

async function createUser(userData) {
    if (pool) {
        try {
            const result = await pool.query(`
                INSERT INTO users (username, email, password_hash, display_name, auth_provider, email_verified)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id, username, email, display_name, auth_provider, created_at
            `, [
                userData.username,
                userData.email,
                userData.password_hash,
                userData.display_name,
                userData.auth_provider || 'local',
                userData.email_verified || false
            ]);
            return result.rows[0];
        } catch (error) {
            console.error('Error creating user:', error.message);
            throw error;
        }
    } else {
        // Fallback to memory (for testing only)
        const newUser = {
            id: fallbackUsers.length + 1,
            ...userData,
            created_at: new Date()
        };
        fallbackUsers.push(newUser);
        return newUser;
    }
}

// Routes

// Check if user is authenticated
router.get('/me', async (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'] || req.query.session;

        if (!sessionId) {
            return res.status(401).json({ error: 'No session provided' });
        }

        const user = await getUserBySession(sessionId);

        if (!user) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        // Update last login if using database
        if (pool) {
            try {
                await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
            } catch (error) {
                console.error('Error updating last login:', error.message);
            }
        }

        // Return user data without sensitive information
        const userData = {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.display_name,
            profilePicture: user.profile_picture,
            authProvider: user.auth_provider,
            emailVerified: user.email_verified,
            lastLogin: user.last_login
        };

        res.json(userData);
    } catch (error) {
        console.error('Auth check error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, displayName } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        // Check if user already exists
        const existingUser = await findUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ error: 'Email already exists' });
        }

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create new user
        const newUser = await createUser({
            username,
            email,
            password_hash: passwordHash,
            display_name: displayName || username,
            auth_provider: 'local',
            email_verified: false
        });

        // Create session
        const sessionId = await createUserSession(newUser.id);

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                displayName: newUser.display_name,
                authProvider: newUser.auth_provider
            },
            sessionId
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login with email/password
router.post('/login', async (req, res) => {

    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find user by email
        const user = await findUserByEmail(email);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // password check for basic auth users
        if (user.auth_provider === 'local' && user.password_hash) {
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            if (!isValidPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
        }

        // Create session
        const sessionId = await createUserSession(user.id);

        // Update last login if using database
        if (pool) {
            try {
                await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
            } catch (error) {
                console.error('Error updating last login:', error.message);
            }
        }

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                displayName: user.display_name,
                profilePicture: user.profile_picture,
                authProvider: user.auth_provider
            },
            sessionId
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Google OAuth login (only if configured)
router.get('/google', (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(501).send('Google OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file.');
    }

    // Build Google OAuth URL
    const googleAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
        new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            redirect_uri: process.env.BASE_URL + '/api/auth/google/callback',
            scope: 'email profile',
            response_type: 'code',
            access_type: 'offline',
            prompt: 'select_account'
        });

    console.log('Redirecting to Google OAuth:', googleAuthUrl);
    res.redirect(googleAuthUrl);
});

router.get('/google/callback', async (req, res) => {
    try {
        const { code, error } = req.query;

        if (error) {
            console.error('Google OAuth error:', error);
            return res.redirect('/?error=google_auth_failed');
        }

        if (!code) {
            console.error('No authorization code received');
            return res.redirect('/?error=google_auth_failed');
        }

        console.log('Received Google auth code, exchanging for tokens...');

        // Exchange code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: process.env.BASE_URL + '/api/auth/google/callback'
            })
        });

        const tokens = await tokenResponse.json();
        console.log('Token exchange result:', tokens.access_token ? 'SUCCESS' : 'FAILED');

        if (!tokens.access_token) {
            console.error('Failed to get access token:', tokens);
            return res.redirect('/?error=google_auth_failed');
        }

        // Get user info from Google
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });

        const googleUser = await userResponse.json();
        console.log('Google user info received:', googleUser.email);

        // Check if user exists
        let user = await findUserByEmail(googleUser.email);

        if (user) {
            console.log('Existing user found, updating Google info...');
            // Update user with Google info
            if (pool) {
                try {
                    await pool.query(`
                        UPDATE users 
                        SET google_id = $1, display_name = $2, profile_picture = $3, 
                            email_verified = $4, last_login = NOW()
                        WHERE id = $5
                    `, [googleUser.id, googleUser.name, googleUser.picture, googleUser.verified_email, user.id]);

                    // Refresh user data
                    user = await findUserByEmail(googleUser.email);
                } catch (error) {
                    console.error('Error updating user with Google info:', error);
                }
            }
        } else {
            console.log('Creating new user from Google account...');
            // Create new user
            user = await createUser({
                username: googleUser.email.split('@')[0],
                email: googleUser.email,
                google_id: googleUser.id,
                display_name: googleUser.name,
                profile_picture: googleUser.picture,
                auth_provider: 'google',
                email_verified: googleUser.verified_email || false
            });
        }

        // Create session
        const sessionId = await createUserSession(user.id);
        console.log('Session created for Google user');

        // Redirect back to the app with success
        res.redirect(`/?login=success&provider=google&sessionId=${sessionId}`);

    } catch (error) {
        console.error('Google OAuth callback error:', error);
        res.redirect('/?error=google_auth_failed');
    }
});

// Logout
router.post('/logout', async (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'] || req.body.sessionId;

        if (sessionId) {
            if (pool) {
                try {
                    await pool.query('DELETE FROM user_sessions WHERE session_id = $1', [sessionId]);
                } catch (error) {
                    console.error('Error deleting session from database:', error.message);
                }
            }
            fallbackSessions.delete(sessionId);
        }

        res.json({ message: 'Logout successful' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

// Health check for auth system
router.get('/health', async (req, res) => {
    const status = {
        auth: 'OK',
        database: pool ? 'Connected' : 'Fallback mode',
        google_oauth: googleClient ? 'Configured' : 'Not configured',
        timestamp: new Date().toISOString()
    };

    if (pool) {
        try {
            await pool.query('SELECT 1');
            status.database = 'Connected and working';
        } catch (error) {
            status.database = 'Connected but error: ' + error.message;
        }
    }

    res.json(status);
});

module.exports = router;