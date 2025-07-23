// src/backend/routes/game.js
const express = require('express');
const router = express.Router();
const pool = require('../../shared/database/connection');
const gameFactory = require('../game-logic/game-factory');

// In-memory game session storage (consider Redis for production)
const gameSessions = new Map();

// Generate unique session ID
function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Generic game initialization - no DB write until first move
router.post('/:gameId/start', async (req, res) => {
    try {
        const { gameId } = req.params;

        if (!gameFactory.isValidGameId(gameId)) {
            return res.status(400).json({ error: 'Invalid game type' });
        }

        const engine = gameFactory.getEngine(gameId);
        const sessionId = generateSessionId();

        // Initialize game state (no DB write yet)
        const gameState = engine.initializeGame(req.body);

        // Store in memory temporarily
        gameSessions.set(sessionId, {
            ...gameState,
            sessionId,
            userId: req.user.id,
            lastActivity: new Date(),
            isPersisted: false,
            isInitializing: false // Add flag to prevent concurrent initialization
        });

        res.json({
            success: true,
            sessionId,
            gameId,
            state: gameState
        });

    } catch (error) {
        console.error('Game start error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generic move processing with lazy DB initialization
router.post('/:gameId/move', async (req, res) => {
    try {
        const { gameId } = req.params;
        const { sessionId, move } = req.body;

        if (!sessionId || !move) {
            return res.status(400).json({ error: 'Missing sessionId or move' });
        }

        const session = gameSessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Game session not found' });
        }

        // Check if another request is already processing this session
        if (session.isProcessing) {
            return res.status(429).json({ error: 'Move already being processed' });
        }

        // Lock session for processing
        session.isProcessing = true;

        try {
            const engine = gameFactory.getEngine(gameId);

            // Process the move
            let newState = engine.processMove(session, move);

            // Update session
            session.lastActivity = new Date();
            Object.assign(session, newState);

            // Lazy database initialization - save on first move (with race condition protection)
            if (!session.isPersisted && !session.isInitializing) {
                session.isInitializing = true;
                try {
                    await initializeGameInDB(session, engine);
                    session.isPersisted = true;
                } catch (error) {
                    // Check if error is due to duplicate key (race condition)
                    if (error.code === '23505' && error.constraint === 'tic_tac_toe_games_game_session_id_key') {
                        console.log(`Game session ${sessionId} already initialized by another request`);
                        session.isPersisted = true; // Mark as persisted since it exists
                    } else {
                        throw error; // Re-throw if it's a different error
                    }
                } finally {
                    session.isInitializing = false;
                }
            }

            // Update game state in database (only if already persisted)
            if (session.isPersisted) {
                await updateGameStateInDB(session, engine);
            }

            // If game is over, complete the game record
            if (newState.gameOver && session.isPersisted) {
                await completeGameInDB(session, engine);
                // Clean up session
                gameSessions.delete(sessionId);

                // Release lock and return result
                return res.json({
                    success: true,
                    newState,
                    aiMove: null
                });
            }

            // Handle AI move if applicable
            let aiMove = null;
            if (!newState.gameOver && newState.currentPlayer === 'O') {
                aiMove = engine.getAIMove(newState, session.difficulty);
                if (aiMove) {
                    const aiState = engine.processMove(newState, aiMove);
                    Object.assign(session, aiState);

                    // Update AI move in database
                    if (session.isPersisted) {
                        await updateGameStateInDB(session, engine);
                    }

                    if (aiState.gameOver && session.isPersisted) {
                        await completeGameInDB(session, engine);
                        gameSessions.delete(sessionId);
                    }

                    newState = aiState;
                }
            }

            res.json({
                success: true,
                newState,
                aiMove
            });

        } finally {
            // Always release the processing lock
            if (session) {
                session.isProcessing = false;
            }
        }

    } catch (error) {
        console.error('Move processing error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generic stats endpoint
router.get('/:gameId/stats', async (req, res) => {
    try {
        const { gameId } = req.params;
        const userId = req.query.userId || req.user?.id;

        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        if (!gameFactory.isValidGameId(gameId)) {
            return res.status(400).json({ error: 'Invalid game type' });
        }

        const stats = await getGameStats(gameId, userId);
        res.json(stats);

    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generic cleanup endpoint
router.post('/:gameId/cleanup', async (req, res) => {
    try {
        const { gameId } = req.params;

        if (!gameFactory.isValidGameId(gameId)) {
            return res.status(400).json({ error: 'Invalid game type' });
        }

        const result = await cleanupAbandonedGames(gameId);

        // Also clean up memory sessions older than 1 hour
        const now = new Date();
        let cleanedSessions = 0;
        for (let [sessionId, session] of gameSessions.entries()) {
            if (now - session.lastActivity > 60 * 60 * 1000) { // 1 hour
                gameSessions.delete(sessionId);
                cleanedSessions++;
            }
        }

        res.json({
            success: true,
            deletedGames: result,
            cleanedSessions,
            message: `Cleaned up ${result} abandoned games and ${cleanedSessions} expired sessions`
        });

    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List all available games
router.get('/', async (req, res) => {
    try {
        const availableGames = gameFactory.getAvailableGames();

        // Add metadata for each game
        const games = availableGames.map(game => ({
            id: game.id,
            name: game.name,
            description: getGameDescription(game.id),
            icon: getGameIcon(game.id),
            difficulty: getGameDifficulty(game.id),
            players: 1, // Default for AI games
            status: 'active',
            category: getGameCategory(game.id)
        }));

        res.json({ games });
    } catch (error) {
        console.error('Games list error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Database helper functions
async function initializeGameInDB(session, engine) {
    if (!session.userId) return; // Skip if no user

    await pool.query(
        'SELECT start_tic_tac_toe_game($1, $2, $3, $4)',
        [session.userId, session.sessionId, session.playerStarts, session.difficulty]
    );
}

async function updateGameStateInDB(session, engine) {
    const serialized = engine.serializeState(session);
    await pool.query(
        'SELECT upsert_tic_tac_toe_state($1, $2)',
        [serialized.boardState, session.moveCount]
    );
}

async function completeGameInDB(session, engine) {
    if (!session.userId) {
        console.error('missing User ID', session.sessionId);
        throw new Error(`User ID for ${session.sessionId} not found`);
    }

    try {
        const serialized = engine.serializeState(session);
        const winner = session.winner === 'tie' ? 'T' : session.winner;

        const result = await pool.query(
            'SELECT complete_tic_tac_toe_game($1, $2, $3, $4, $5, $6)',
            [session.sessionId, serialized.metadata.moveSequence, winner,
                session.moveCount, 0, session.userId]
        );
        console.log("game completion result:", result.rows[0]);
    } catch (error) {
        console.error("Failed to complete game in DB:", error);
        throw error;
    }
}

async function getGameStats(gameId, userId) {
    // This would need to be made more generic for different game types
    const result = await pool.query(`        SELECT 
            COUNT(*) as total_games,
            COUNT(CASE WHEN winner = 'X' THEN 1 END) as wins,
            COUNT(CASE WHEN winner = 'O' THEN 1 END) as losses,
            COUNT(CASE WHEN winner = 'T' THEN 1 END) as ties,
            AVG(total_moves) as avg_moves,
            MAX(final_score) as best_score,
            COUNT(CASE WHEN completed_at IS NULL THEN 1 END) as incomplete_games
        FROM tic_tac_toe_games 
        WHERE user_id = $1
    `, [userId]);

    return result.rows[0];
}

async function cleanupAbandonedGames(gameId) {
    // For now, just handle tic-tac-toe, but this could be made generic
    const result = await pool.query('SELECT cleanup_abandoned_tic_tac_toe_games()');
    return result.rows[0].cleanup_abandoned_tic_tac_toe_games;
}

// Game metadata helpers (could be moved to game engines)
function getGameDescription(gameId) {
    const descriptions = {
        'tic-tac-toe': 'Classic game with adaptive AI opponent',
        'snake': 'Snake game with predictive AI assistance',
        'puzzle': 'Dynamic puzzles that adapt to your skill',
        'chess': 'Chess with AI that learns your style'
    };
    return descriptions[gameId] || 'Fun game with AI features';
}

function getGameIcon(gameId) {
    const icons = {
        'tic-tac-toe': '⭕',
        'snake': '🐍',
        'puzzle': '🧩',
        'chess': '♟️'
    };
    return icons[gameId] || '🎮';
}

function getGameDifficulty(gameId) {
    const difficulties = {
        'tic-tac-toe': 'Easy',
        'snake': 'Medium',
        'puzzle': 'Hard',
        'chess': 'Expert'
    };
    return difficulties[gameId] || 'Medium';
}

function getGameCategory(gameId) {
    const categories = {
        'tic-tac-toe': 'strategy',
        'snake': 'arcade',
        'puzzle': 'puzzle',
        'chess': 'strategy'
    };
    return categories[gameId] || 'arcade';
}

module.exports = router;