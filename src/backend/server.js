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
const authRoutes = require('./routes/auth');

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
        // Mock game data for now
        const games = [
            {
                id: 'tic-tac-toe',
                name: 'Tic Tac Toe',
                description: 'Classic game with an AI that learns your strategies',
                icon: '⭕',
                difficulty: 'Easy',
                players: 2
            },
            {
                id: 'connect-four',
                name: 'Connect Four',
                description: 'Strategic gameplay with adaptive AI opponent',
                icon: '🔴',
                difficulty: 'Medium',
                players: 2
            },
            {
                id: 'memory-game',
                name: 'Memory Game',
                description: 'Test your memory against an AI that remembers everything',
                icon: '🎲',
                difficulty: 'Hard',
                players: 1
            },
            {
                id: 'word-battle',
                name: 'Word Battle',
                description: 'Challenge the AI\'s growing vocabulary',
                icon: '🎯',
                difficulty: 'Medium',
                players: 2
            },
            {
                id: 'puzzle-master',
                name: 'Puzzle Master',
                description: 'Solve puzzles while AI learns your patterns',
                icon: '🧩',
                difficulty: 'Hard',
                players: 1
            }
        ];

        res.json(games);
    } catch (error) {
        console.error('Games API error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Specific route handlers for different pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

app.get('/games', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/games.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/about.html'));
});

app.get('/game/:gameId', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/game.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message
    });
});

// 404 handler for any unmatched routes
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${process.env.DB_NAME}`);
    console.log(`🎮 Available routes:`);
    console.log(`   - GET  /              (Home page)`);
    console.log(`   - GET  /games         (Games page)`);
    console.log(`   - GET  /about         (About page)`);
    console.log(`   - GET  /game/:gameId  (Individual game)`);
    console.log(`🔌 Available API endpoints:`);
    console.log(`   - GET  /api/health`);
    console.log(`   - GET  /api/test-db`);
    console.log(`   - GET  /api/games`);
    console.log(`   - GET  /api/auth/me`);
    console.log(`   - POST /api/auth/login`);
    console.log(`   - POST /api/ai/move`);
    console.log(`   - GET  /api/game/state`);
});

module.exports = app;