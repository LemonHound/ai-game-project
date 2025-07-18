const express = require('express');
const router = express.Router();
const pool = require('../../shared/database/connection');

// Simple session storage (in production, use Redis or proper session store)
const sessions = new Map();

// Mock user data (in production, this would be in your database)
const mockUsers = [
    {
        id: 1,
        email: 'demo@aigamehub.com',
        displayName: 'Demo Player',
        gamesPlayed: 15,
        winRate: 67,
        aiContributions: 42
    },
    {
        id: 2,
        email: 'test@example.com',
        displayName: 'Test User',
        gamesPlayed: 5,
        winRate: 80,
        aiContributions: 12
    }
];

// Check if user is authenticated
router.get('/me', async (req, res) => {
    try {
        // For now, return null (no authentication)
        // In a real app, you'd check session/JWT token
        const sessionId = req.headers['x-session-id'];

        if (sessionId && sessions.has(sessionId)) {
            const userId = sessions.get(sessionId);
            const user = mockUsers.find(u => u.id === userId);

            if (user) {
                res.json(user);
                return;
            }
        }

        // No authenticated user
        res.status(401).json({ error: 'Not authenticated' });
    } catch (error) {
        console.error('Auth check error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Simple mock authentication
        // In production, hash passwords and check against database
        const user = mockUsers.find(u => u.email === email);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // For demo purposes, any password works
        // In production: const isValidPassword = await bcrypt.compare(password, user.hashedPassword);

        // Create session
        const sessionId = generateSessionId();
        sessions.set(sessionId, user.id);

        // Return user data and session ID
        res.json({
            user,
            sessionId,
            message: 'Login successful'
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Register endpoint
router.post('/register', async (req, res) => {
    try {
        const { email, password, displayName } = req.body;

        // Check if user already exists
        const existingUser = mockUsers.find(u => u.email === email);
        if (existingUser) {
            return res.status(409).json({ error: 'User already exists' });
        }

        // Create new user
        const newUser = {
            id: mockUsers.length + 1,
            email,
            displayName: displayName || email.split('@')[0],
            gamesPlayed: 0,
            winRate: 0,
            aiContributions: 0
        };

        mockUsers.push(newUser);

        // Create session
        const sessionId = generateSessionId();
        sessions.set(sessionId, newUser.id);

        res.status(201).json({
            user: newUser,
            sessionId,
            message: 'Registration successful'
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Logout endpoint
router.post('/logout', (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'];

        if (sessionId && sessions.has(sessionId)) {
            sessions.delete(sessionId);
        }

        res.json({ message: 'Logout successful' });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update profile endpoint
router.put('/profile', async (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'];

        if (!sessionId || !sessions.has(sessionId)) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const userId = sessions.get(sessionId);
        const userIndex = mockUsers.findIndex(u => u.id === userId);

        if (userIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update user data
        const { displayName } = req.body;
        if (displayName) {
            mockUsers[userIndex].displayName = displayName;
        }

        res.json({
            user: mockUsers[userIndex],
            message: 'Profile updated successfully'
        });

    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get user stats
router.get('/stats', async (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'];

        if (!sessionId || !sessions.has(sessionId)) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const userId = sessions.get(sessionId);
        const user = mockUsers.find(u => u.id === userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Return just the stats
        res.json({
            gamesPlayed: user.gamesPlayed,
            winRate: user.winRate,
            aiContributions: user.aiContributions
        });

    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function to generate session IDs
function generateSessionId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

module.exports = router;