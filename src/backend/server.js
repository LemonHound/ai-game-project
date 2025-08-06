const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const path = require('path');
// const cleanupService = require('./services/cleanup-scheduler');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const { authMiddleware, dynamicAuthMiddleware } = require('./middleware/auth');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// cookie management
app.use(cookieParser());
app.use(authMiddleware);

const csrfProtection = csrf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
    },
});

// Template engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../frontend/views'));

// Session configuration
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'your-super-secret-key-change-in-production',
        name: 'sessionId',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            sameSite: 'strict',
        },
        store: undefined, // will implement a database store later
    })
);

// Middleware
app.use(
    helmet({
        contentSecurityPolicy: false, // Disable CSP for development
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

// Apply auth middleware to all routes
app.use(authMiddleware);

// Import route modules
const aiRoutes = require('./routes/ai');
const gameRoutes = require('./routes/game');
const authRoutes = require('./routes/auth');

// make CSRF token fetch publicly accessible
app.get('/api/csrf-token', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

// Apply CSRF protection ONLY to specific auth endpoints that need it
app.use('/api/auth/login', csrfProtection);
app.use('/api/auth/register', csrfProtection);
app.use('/api/auth/logout', csrfProtection);

// API Routes - now with conditional authentication
app.use('/api/auth', authRoutes); // Auth routes first
app.use('/api/ai', aiRoutes);
app.use('/api', gameRoutes); // Generic game routes last

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
];

// Helper function to pass auth data to templates
const getTemplateData = (req, additionalData = {}) => {
    return {
        isAuthenticated: req.isAuthenticated || false,
        currentUser: req.user || null,
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
        authenticated: req.isAuthenticated || false,
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
            authenticated: req.isAuthenticated || false,
        });
    } catch (error) {
        console.error('Database test error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Games API endpoint
app.get('/api/games', (req, res) => {
    res.json({
        games,
        authenticated: req.isAuthenticated || false,
        user: req.user
            ? {
                  id: req.user.id,
                  username: req.user.username,
                  displayName: req.user.display_name,
              }
            : null,
    });
});

// Page Routes with Templates
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

// Profile page (requires authentication)
app.get('/profile', (req, res) => {
    if (!req.isAuthenticated) {
        return res.redirect('/?login=required');
    }

    res.render('layout', {
        title: 'Profile - AI Game Hub',
        currentPage: 'profile',
        currentTemplate: 'profile',
        ...getTemplateData(req),
    });
});

// Settings page (requires authentication)
app.get('/settings', (req, res) => {
    if (!req.isAuthenticated) {
        return res.redirect('/?login=required');
    }

    res.render('layout', {
        title: 'Settings - AI Game Hub',
        currentPage: 'settings',
        currentTemplate: 'settings',
        ...getTemplateData(req),
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
            ...getTemplateData(req),
        });
    }

    const currentGame = games.find(g => g.id === gameId);

    if (!currentGame) {
        return res.status(404).render('layout', {
            title: 'Game Not Found - AI Game Hub',
            currentPage: 'error',
            currentTemplate: '404',
            ...getTemplateData(req),
        });
    }

    if (currentGame.status === 'coming-soon') {
        return res.redirect(`/games?highlight=${gameId}`);
    }

    res.render('layout', {
        title: `${currentGame.name} - AI Game Hub`,
        currentPage: 'games',
        currentTemplate: 'game',
        currentGame: currentGame,
        gameStats: {
            gamesPlayed: req.isAuthenticated ? 12 : 0,
            winRate: req.isAuthenticated ? 67 : 0,
            bestStreak: req.isAuthenticated ? 5 : 0,
            aiLevel: 3,
        },
        pageScripts: [`${gameId}.js`], // This loads the corresponding JS file - NAME MUST MATCH
        ...getTemplateData(req),
    });
});

// API route to get specific game information
app.get('/api/game/:gameId/info', (req, res) => {
    const { gameId } = req.params;
    const game = games.find(g => g.id === gameId);

    if (!game) {
        return res.status(404).json({ error: 'Game not found' });
    }

    res.json({
        game,
        authenticated: req.isAuthenticated || false,
        user: req.user
            ? {
                  id: req.user.id,
                  username: req.user.username,
                  displayName: req.user.display_name,
              }
            : null,
    });
});

app.get('/api/csrf-token', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

// API 404 handler - for routes starting with /api (Express 5 compatible)
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

// Regular 404 handler for all other routes (pages)
app.use((req, res) => {
    res.status(404).render('layout', {
        title: 'Page Not Found - AI Game Hub',
        currentPage: 'error',
        currentTemplate: '404',
        ...getTemplateData(req),
    });
});

// Error handling middleware (must have 4 parameters!)
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);

    // Check if this is an API request
    if (req.originalUrl.startsWith('/api')) {
        res.status(500).json({
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message,
        });
    } else {
        // Render error page for regular requests
        res.status(500).render('layout', {
            title: 'Server Error - AI Game Hub',
            currentPage: 'error',
            currentTemplate: '404', // You could create a separate 500.ejs if desired
            error: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message,
            ...getTemplateData(req),
        });
    }
});

/**
 * Cleanup service for database storage of game states and player games
 */
/*
cleanupService.start(5); // Run every 5 minutes

// Shutdowns
process.on('SIGTERM', () => {
    cleanupService.stop();
    process.exit(0);
});
process.on('SIGINT', () => {
    cleanupService.stop();
    process.exit(0);
});
*/

/**
 * Start the app listening for events.
 */
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${process.env.DB_NAME}`);
    console.log(`🔐 Session Secret: ${process.env.SESSION_SECRET ? 'Set' : 'Using default (change this!)'}`);
    console.log(`🌐 Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? 'Configured' : 'Not configured'}`);
});

module.exports = app;
