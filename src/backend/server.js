const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const cookieParser = require('cookie-parser');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Cookie management (keep for reading cookies, but not auth)
app.use(cookieParser());

// Template engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../frontend/views'));

// Middleware
app.use(
    helmet({
        contentSecurityPolicy: false,
    })
);
app.use(
    cors({
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    })
);
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '../frontend/public')));

// REMOVE all auth imports and routes:
// const authRoutes = require('./routes/auth');
// const { authMiddleware, dynamicAuthMiddleware } = require('./middleware/auth');
// app.use(authMiddleware);
// app.use('/api/auth', authRoutes);

// Keep game and AI routes if needed, or remove if moving to Python
const aiRoutes = require('./routes/ai');
const gameRoutes = require('./routes/game');

app.use('/api/ai', aiRoutes);
app.use('/api', gameRoutes);

// Updated game data
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
        tags: ['Strategy', '1 Player', 'Quick Play'],
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
        tags: ['Strategy', '1 Player', 'Territory'],
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
        tags: ['Strategy', '1 Player', 'Classic'],
    },
    {
        id: 'chess',
        name: 'Chess',
        description: 'Chess with AI that learns your playing style and adapts its strategy',
        icon: '♟️',
        difficulty: 'Expert',
        players: 1,
        status: 'active',
        category: 'strategy',
        tags: ['Strategy', '1 Player', 'Coming Soon'],
    },
    {
        id: 'checkers',
        name: 'Checkers',
        description: 'Classic checkers with an AI that adapts to your tactical preferences',
        icon: '⚫',
        difficulty: 'Hard',
        players: 1,
        status: 'active',
        category: 'strategy',
        tags: ['Strategy', '1 Player', 'Classic'],
    },
    {
        id: 'pong',
        name: 'Pong',
        description: 'Classic pong game, popularized by Atari',
        icon: '🕹️',
        difficulty: 'Easy',
        players: 1,
        status: 'active',
        category: 'arcade',
        tags: ['arcade', '1 Player', 'Classic'],
    },
];

// Helper function - SIMPLIFIED (no auth data)
const getTemplateData = (req, additionalData = {}) => {
    return {
        isAuthenticated: false, // Always false - auth handled by Python
        currentUser: null, // Always null - frontend will check via API
        games: games.slice(0, 5),
        ...additionalData,
    };
};

// Basic API routes
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Server is running!',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
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
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Database test error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Games API endpoint
app.get('/api/games', (req, res) => {
    res.json({ games });
});

// Page Routes - REMOVE auth checks
app.get('/', (req, res) => {
    res.render('layout', {
        title: 'AI Game Hub - Intelligent Gaming Experience',
        currentPage: 'home',
        currentTemplate: 'index',
        featuredGames: games.filter(g => g.status === 'active').slice(0, 3),
        ...getTemplateData(req),
    });
});

app.get('/games', (req, res) => {
    res.render('layout', {
        title: 'All Games - AI Game Hub',
        currentPage: 'games',
        currentTemplate: 'games',
        allGames: games,
        highlight: req.query.highlight || null,
        ...getTemplateData(req),
    });
});

app.get('/about', (req, res) => {
    res.render('layout', {
        title: 'About - AI Game Hub',
        currentPage: 'about',
        currentTemplate: 'about',
        ...getTemplateData(req),
    });
});

// Profile page - REMOVE auth check, frontend will handle
app.get('/profile', (req, res) => {
    res.render('layout', {
        title: 'Profile - AI Game Hub',
        currentPage: 'profile',
        currentTemplate: 'profile',
        ...getTemplateData(req),
    });
});

// Settings page - REMOVE auth check
app.get('/settings', (req, res) => {
    res.render('layout', {
        title: 'Settings - AI Game Hub',
        currentPage: 'settings',
        currentTemplate: 'settings',
        ...getTemplateData(req),
    });
});

// Individual game routes
const validGames = ['tic-tac-toe', 'dots-and-boxes', 'connect4', 'chess', 'checkers', 'pong'];

app.get('/game/:gameId', (req, res) => {
    const { gameId } = req.params;

    if (!validGames.includes(gameId)) {
        return res.status(404).render('layout', {
            title: 'Game Not Found - AI Game Hub',
            currentPage: 'error',
            currentTemplate: '404',
            ...getTemplateData(req),
        });
    }

    const currentGame = games.find(g => g.id === gameId);

    if (!currentGame || currentGame.status === 'coming-soon') {
        return res.redirect(`/games?highlight=${gameId}`);
    }

    res.render('layout', {
        title: `${currentGame.name} - AI Game Hub`,
        currentPage: 'games',
        currentTemplate: 'game',
        currentGame: currentGame,
        gameStats: {
            gamesPlayed: 0,
            winRate: 0,
            bestStreak: 0,
            aiLevel: 3,
        },
        pageScripts: [`${gameId}.js`],
        ...getTemplateData(req),
    });
});

// API route for game info
app.get('/api/game/:gameId/info', (req, res) => {
    const { gameId } = req.params;
    const game = games.find(g => g.id === gameId);

    if (!game) {
        return res.status(404).json({ error: 'Game not found' });
    }

    res.json({ game });
});

// REMOVE CSRF endpoint - Python handles this now
// app.get('/api/csrf-token', csrfProtection, (req, res) => { ... });

// 404 handlers
app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/api')) {
        res.status(404).json({
            error: 'API endpoint not found',
            path: req.originalUrl,
            method: req.method,
        });
    } else {
        next();
    }
});

app.use((req, res) => {
    res.status(404).render('layout', {
        title: 'Page Not Found - AI Game Hub',
        currentPage: 'error',
        currentTemplate: '404',
        ...getTemplateData(req),
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);

    if (req.originalUrl.startsWith('/api')) {
        res.status(500).json({
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message,
        });
    } else {
        res.status(500).render('layout', {
            title: 'Server Error - AI Game Hub',
            currentPage: 'error',
            currentTemplate: '404',
            error: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message,
            ...getTemplateData(req),
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Frontend server running on http://localhost:${PORT}`);
    console.log(`🔐 Auth handled by Python backend on port 8000`);
});

module.exports = app;
