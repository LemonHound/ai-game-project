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

// Updated game data with new games
const games = [
    {
        id: 'tic-tac-toe',
        name: 'Tic Tac Toe',
        description: 'Classic 3x3 grid game with adaptive AI opponent that learns your strategies',
        icon: '⭕',
        difficulty: 'Easy',
        players: 1,
        status: 'active',
        category: 'strategy',
        tags: ['Strategy', '1 Player', 'Quick Play']
    },
    {
        id: 'dots-and-boxes',
        name: 'Dots and Boxes',
        description: 'Connect dots to complete boxes and claim territory in this strategic paper game',
        icon: '⬜',
        difficulty: 'Medium',
        players: 1,
        status: 'active',
        category: 'strategy',
        tags: ['Strategy', '1 Player', 'Territory']
    },
    {
        id: 'connect4',
        name: 'Connect 4',
        description: 'Drop pieces to connect four in a row - vertically, horizontally, or diagonally',
        icon: '🔴',
        difficulty: 'Medium',
        players: 1,
        status: 'active',
        category: 'strategy',
        tags: ['Strategy', '1 Player', 'Classic']
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
        id: 'checkers',
        name: 'Smart Checkers',
        description: 'Classic checkers with an AI that adapts to your tactical preferences',
        icon: '⚫',
        difficulty: 'Hard',
        players: 1,
        status: 'coming-soon',
        category: 'strategy',
        tags: ['Strategy', '1 Player', 'Coming Soon']
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

// Individual game routes - updated with new games
const validGames = ['tic-tac-toe', 'dots-and-boxes', 'connect4', 'chess', 'checkers'];

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
        currentTemplate: gameId, // This will load 'tic-tac-toe.ejs', 'dots-and-boxes.ejs', etc.
        games: games.slice(0, 5),
        currentGame: currentGame,
        gameStats: {
            gamesPlayed: 12,
            winRate: 67,
            bestStreak: 5,
            aiLevel: 3
        },
        pageScripts: [`${gameId}.js`] // This loads the corresponding JS file
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

// API 404 handler - for routes starting with /api (Express 5 compatible)
app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/api')) {
        res.status(404).json({
            error: 'API endpoint not found',
            path: req.originalUrl,
            method: req.method
        });
    } else {
        next();
    }
});

// Regular 404 handler for all other routes (pages)
app.use((req, res) => {
    res.status(404).render('layout', {
        title: 'Page Not Found - AI Game Hub',
        currentPage: 'error',
        currentTemplate: '404',
        games: games.slice(0, 5)
    });
});

// Error handling middleware (must have 4 parameters!)
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);

    // Check if this is an API request
    if (req.originalUrl.startsWith('/api')) {
        res.status(500).json({
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message
        });
    } else {
        // Render error page for regular requests
        res.status(500).render('layout', {
            title: 'Server Error - AI Game Hub',
            currentPage: 'error',
            currentTemplate: '404', // You could create a separate 500.ejs if desired
            games: games.slice(0, 5),
            error: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${process.env.DB_NAME}`);
});

module.exports = app;