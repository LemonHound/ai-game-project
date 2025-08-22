const GameEngineInterface = require('./game-engine-interface');
const pool = require('../../shared/database/connection');

class PongEngine extends GameEngineInterface {
    constructor() {
        super();
        this.engine_id = 'pong';
    }

    getEngineId() {
        return this.engine_id;
    }

    initializeGame() {
        return {
            leftPaddle: {
                x: 20,
                y: 160,
                score: 0,
            },
            rightPaddle: {
                x: 765,
                y: 160,
                score: 0,
            },
            ball: {
                x: 400,
                y: 200,
                velocityX: 4,
                velocityY: 0,
                attached: true,
                attachedTo: 'left',
            },
            gameStatus: 'waiting_for_serve',
            playerSide: null,
            lastHit: null,
        };
    }

    isValidMove(gameState, move) {
        // Basic validation for pong moves
        if (!move || typeof move !== 'object') return false;

        // Validate move types
        const validMoveTypes = ['paddle_move', 'serve_ball', 'choose_side'];
        return validMoveTypes.includes(move.type);
    }

    processMove(gameState, move) {
        if (!this.isValidMove(gameState, move)) {
            return gameState;
        }

        const newState = { ...gameState };

        switch (move.type) {
            case 'choose_side':
                if (move.side === 'left' || move.side === 'right') {
                    newState.playerSide = move.side;
                    newState.gameStatus = 'playing';
                }
                break;

            case 'paddle_move':
                if (move.side === 'left' || move.side === 'right') {
                    const paddle = move.side === 'left' ? newState.leftPaddle : newState.rightPaddle;
                    paddle.y = Math.max(0, Math.min(320, move.y)); // Clamp to valid range
                }
                break;

            case 'serve_ball':
                if (newState.ball.attached) {
                    newState.ball.velocityX = move.velocityX || 4;
                    newState.ball.velocityY = move.velocityY || 0;
                    newState.ball.attached = false;
                    newState.ball.attachedTo = null;
                    newState.gameStatus = 'playing';
                }
                break;
        }

        return newState;
    }

    isAIMove(gameState) {
        // For now, AI doesn't move (as requested)
        return false;
    }

    checkGameEnd(gameState) {
        // Game ends when a player reaches a certain score (e.g., 11 points)
        const maxScore = 11;
        if (gameState.leftPaddle.score >= maxScore) {
            return { ended: true, winner: 'left', reason: 'score_limit' };
        }
        if (gameState.rightPaddle.score >= maxScore) {
            return { ended: true, winner: 'right', reason: 'score_limit' };
        }
        return { ended: false };
    }

    serializeState(gameState) {
        return JSON.stringify(gameState);
    }

    getAIMove(gameState, difficulty = 'medium') {
        // AI not implemented yet
        return null;
    }

    async getStates(limit = 10) {
        try {
            const query = `
                SELECT game_id, current_state, created_at 
                FROM games 
                WHERE game_type = $1 
                ORDER BY created_at DESC 
                LIMIT $2
            `;
            const result = await pool.query(query, [this.engine_id, limit]);
            return result.rows.map(row => ({
                gameId: row.game_id,
                state: JSON.parse(row.current_state),
                createdAt: row.created_at,
            }));
        } catch (error) {
            console.error('Error fetching pong game states:', error);
            throw error;
        }
    }
}

module.exports = PongEngine;
