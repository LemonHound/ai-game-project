const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for development
}));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Import route modules
const aiRoutes = require('./routes/ai');
const gameRoutes = require('./routes/game');
const authRoutes = require('./routes/auth'); // We'll create this

// API Routes
app.use('/api/ai', aiRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/auth', authRoutes);

// Basic API routes
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Server is running!',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Test database connection endpoint
app.get('/api/test-db', async (req, res) => {
    try {
        const pool = require('../shared/database/connection');
        const result = await pool.query('SELECT COUNT(*) FROM users');
        res.json({
            status: 'Database connected!',
            userCount: result.rows[0].count,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Database test error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Games endpoint to support your frontend
app.get('/api/games', async (req, res) => {
    try {
        // For now, return mock data. Later this would come from database
        const games = [
            {
                id: 'tic-tac-toe',
                name: 'Tic Tac Toe',
                description: 'Classic game with adaptive AI opponent',
                icon: '⭕',
                difficulty: 'Easy',
                players: 1,
                status: 'active'
            },
            {
                id: 'snake',
                name: 'Snake AI',
                description: 'Snake game with predictive AI assistance',
                icon: '🐍',
                difficulty: 'Medium',
                players: 1,
                status: 'active'
            },
            {
                id: 'puzzle',
                name: 'AI Puzzle',
                description: 'Dynamic puzzles that adapt to your skill',
                icon: '🧩',
                difficulty: 'Hard',
                players: 1,
                status: 'active'
            },
            {
                id: 'chess',
                name: 'Chess Master',
                description: 'Chess with AI that learns your style',
                icon: '♟️',
                difficulty: 'Expert',
                players: 1,
                status: 'coming-soon'
            },
            {
                id: 'trivia',
                name: 'Smart Trivia',
                description: 'Trivia questions tailored to your knowledge',
                icon: '🧠',
                difficulty: 'Variable',
                players: 1,
                status: 'coming-soon'
            }
        ];

        res.json(games);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Handle favicon
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// Frontend SPA routes - serve index.html for all frontend routes
const frontendRoutes = ['/', '/games', '/about', '/profile', '/how-it-works', '/support', '/contact', '/privacy', '/terms'];

frontendRoutes.forEach(route => {
    app.get(route, (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
    });
});

// Handle game routes dynamically
app.get('/game/:gameId', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// 404 handler for API routes only
app.use('/api', (req, res, next) => {
    res.status(404).json({
        error: 'API endpoint not found',
        path: req.path,
        method: req.method
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Catch-all for any other routes - serve index.html (SPA behavior)
// Use a middleware approach instead of app.get('*')
app.use((req, res, next) => {
    // Only handle GET requests that aren't API calls
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
    } else {
        next();
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${process.env.DB_NAME}`);
    console.log(`🎮 Available API endpoints:`);
    console.log(`   - GET  /api/health`);
    console.log(`   - GET  /api/test-db`);
    console.log(`   - GET  /api/games`);
    console.log(`   - GET  /api/auth/me`);
    console.log(`   - POST /api/auth/login`);
    console.log(`   - POST /api/ai/move`);
    console.log(`   - GET  /api/game/state`);
});

module.exports = app;