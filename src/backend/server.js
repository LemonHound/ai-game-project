const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Template engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../frontend/views'));

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

// Game data (in production, this would come from database)
const games = [
    {
        id: 'tic-tac-toe',
        name: 'Tic Tac Toe',
        description: 'Classic game with adaptive AI opponent that learns your strategies',
        icon: '⭕',
        difficulty: 'Easy',
        players: 1,
        status: 'active',
        category: 'strategy',
        tags: ['Strategy', '1 Player', 'Quick Play']
    },
    {
        id: 'snake',
        name: 'Snake AI',
        description: 'Navigate the snake with AI assistance that predicts optimal paths',
        icon: '🐍',
        difficulty: 'Medium',
        players: 1,
        status: 'coming-soon',
        category: 'arcade',
        tags: ['Arcade', '1 Player', 'High Score']
    },
    {
        id: 'puzzle',
        name: 'AI Puzzle',
        description: 'Dynamic puzzles that adapt to your skill level and create unique challenges',
        icon: '🧩',
        difficulty: 'Hard',
        players: 1,
        status: 'coming-soon',
        category: 'puzzle',
        tags: ['Puzzle', '1 Player', 'Adaptive']
    },
    {
        id: 'chess',
        name: 'Chess Master',
        description: 'Chess with AI that learns your playing style and adapts its strategy',
        icon: '♟️',
        difficulty: 'Expert',
        players: 1,
        status: 'coming-soon',
        category: 'strategy',
        tags: ['Strategy', '1 Player', 'Coming Soon']
    },
    {
        id: 'trivia',
        name: 'Smart Trivia',
        description: 'Trivia questions tailored to your knowledge level across multiple categories',
        icon: '🧠',
        difficulty: 'Variable',
        players: 1,
        status: 'coming-soon',
        category: 'knowledge',
        tags: ['Knowledge', '1 Player', 'Coming Soon']
    }
];

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

// Games API endpoint
app.get('/api/games', (req, res) => {
    res.json(games);
});

// Page Routes with Templates
app.get('/', (req, res) => {
    res.render('layout', {
        title: 'AI Game Hub - Intelligent Gaming Experience',
        currentPage: 'home',
        currentTemplate: 'index',
        games: games.slice(0, 5),
        featuredGames: games.filter(g => g.status === 'active').slice(0, 3)
    });
});

app.get('/games', (req, res) => {
    res.render('layout', {
        title: 'All Games - AI Game Hub',
        currentPage: 'games',
        currentTemplate: 'games',
        games: games.slice(0, 5),
        allGames: games,
        highlight: req.query.highlight || null
    });
});

app.get('/about', (req, res) => {
    res.render('layout', {
        title: 'About - AI Game Hub',
        currentPage: 'about',
        currentTemplate: 'about',
        games: games.slice(0, 5)
    });
});

// Individual game routes
const validGames = ['tic-tac-toe', 'snake', 'puzzle', 'chess', 'trivia'];

app.get('/game/:gameId', (req, res) => {
    const { gameId } = req.params;

    if (!validGames.includes(gameId)) {
        return res.status(404).render('layout', {
            title: 'Game Not Found - AI Game Hub',
            currentPage: 'error',
            currentTemplate: '404',
            games: games.slice(0, 5)
        });
    }

    const currentGame = games.find(g => g.id === gameId);

    if (!currentGame) {
        return res.status(404).render('layout', {
            title: 'Game Not Found - AI Game Hub',
            currentPage: 'error',
            currentTemplate: '404',
            games: games.slice(0, 5)
        });
    }

    if (currentGame.status === 'coming-soon') {
        return res.redirect(`/games?highlight=${gameId}`);
    }

    res.render('layout', {
        title: `${currentGame.name} - AI Game Hub`,
        currentPage: 'games',
        currentTemplate: gameId, // This will load 'tic-tac-toe.ejs'
        games: games.slice(0, 5),
        currentGame: currentGame,
        gameStats: {
            gamesPlayed: 12,
            winRate: 67,
            bestStreak: 5,
            aiLevel: 3
        },
        pageScripts: [`${gameId}.js`] // This loads 'tic-tac-toe.js'
    });
});

// API route to get specific game information
app.get('/api/game/:gameId/info', (req, res) => {
    const { gameId } = req.params;
    const game = games.find(g => g.id === gameId);

    if (!game) {
        return res.status(404).json({ error: 'Game not found' });
    }

    res.json(game);
});

// Error handling middleware
app.use((err, req, res) => {
    console.error(err.stack);
    res.status(500).render('layout', {
        title: 'Server Error - AI Game Hub',
        currentPage: '404',
        error: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message
    });
});

// 404 handler for any unmatched routes
app.use((req, res) => {
    res.status(404).render('layout', {
        title: 'Page Not Found - AI Game Hub',
        currentPage: 'error',
        currentTemplate: '404',
        games: games.slice(0, 5)
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${process.env.DB_NAME}`);
});

module.exports = app;