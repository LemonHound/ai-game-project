// src/backend/services/cleanup-scheduler.js
const pool = require('../../shared/database/connection');

class GameCleanupService {
    constructor() {
        this.cleanupInterval = null;
        this.isRunning = false;
    }

    // Start the cleanup scheduler (runs every 5 minutes)
    start(intervalMinutes = 5) {
        if (this.isRunning) {
            console.log('Cleanup service already running');
            return;
        }

        this.isRunning = true;
        console.log(`Starting game cleanup service (runs every ${intervalMinutes} minutes)`);

        // Run cleanup immediately on start
        this.runCleanup();

        // Set up recurring cleanup
        this.cleanupInterval = setInterval(() => {
            this.runCleanup();
        }, intervalMinutes * 60 * 1000);
    }

    // Stop the cleanup scheduler
    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.isRunning = false;
        console.log('Game cleanup service stopped');
    }

    // Run the cleanup process
    async runCleanup() {
        try {
            console.log('Running game cleanup...');

            /**
             * DEBUGGING
             */

            const functionCheck = await pool.query(`
        SELECT 1 FROM pg_proc WHERE proname = 'cleanup_abandoned_tic_tac_toe_games'
    `);

            if (functionCheck.rows.length === 0) {
                console.log('Cleanup function does not exist yet');
                return { success: true, abandonedGames: 0, expiredSessions: 0 };
            }

            /**
             * END DEBUGGING
             */

                // Cleanup abandoned tic tac toe games
            const tttResult = await pool.query('SELECT cleanup_abandoned_tic_tac_toe_games()');
            const tttDeleted = tttResult.rows[0].cleanup_abandoned_tic_tac_toe_games;

            // Cleanup expired sessions
            const sessionResult = await pool.query('SELECT cleanup_expired_sessions()');
            const sessionsDeleted = sessionResult.rows[0].cleanup_expired_sessions;

            // Log results
            if (tttDeleted > 0 || sessionsDeleted > 0) {
                console.log(`Cleanup completed: ${tttDeleted} abandoned games, ${sessionsDeleted} expired sessions`);
            } else {
                console.log('Cleanup completed: No items to clean');
            }

            return {
                success: true,
                abandonedGames: tttDeleted,
                expiredSessions: sessionsDeleted,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('Cleanup error:', error);
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Get cleanup statistics
    async getCleanupStats() {
        try {
            const result = await pool.query(`
                SELECT 
                    'tic_tac_toe_games' as table_name,
                    COUNT(CASE WHEN completed_at IS NULL THEN 1 END) as incomplete_games,
                    COUNT(CASE WHEN completed_at IS NULL AND started_at < NOW() - INTERVAL '10 minutes' THEN 1 END) as games_to_cleanup,
                    COUNT(*) as total_games
                FROM tic_tac_toe_games
                
                UNION ALL
                
                SELECT 
                    'user_sessions' as table_name,
                    COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as expired_sessions,
                    COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as sessions_to_cleanup,
                    COUNT(*) as total_sessions
                FROM user_sessions
            `);

            return {
                success: true,
                stats: result.rows,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('Stats error:', error);
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Manual cleanup trigger
    async forceCleanup() {
        console.log('Manual cleanup triggered');
        return await this.runCleanup();
    }
}

// Singleton instance
const cleanupService = new GameCleanupService();

module.exports = cleanupService;

// Example usage in app.js or server.js:
/*
const cleanupService = require('./src/backend/services/cleanup-scheduler');

// Start cleanup service when server starts
cleanupService.start(5); // Run every 5 minutes

// Graceful shutdown
process.on('SIGTERM', () => {
    cleanupService.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    cleanupService.stop();
    process.exit(0);
});
*/

// Optional: Add cleanup endpoints to your routes
/*
// In your routes file:
const cleanupService = require('../services/cleanup-scheduler');

// Manual cleanup trigger
router.post('/admin/cleanup', async (req, res) => {
    const result = await cleanupService.forceCleanup();
    res.json(result);
});

// Cleanup statistics
router.get('/admin/cleanup/stats', async (req, res) => {
    const stats = await cleanupService.getCleanupStats();
    res.json(stats);
});
*/