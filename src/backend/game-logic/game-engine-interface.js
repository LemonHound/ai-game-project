/**
 * Standard interface that all game engines must implement
 */
class GameEngineInterface {
    /**
     * Get the game engine ID
     * @returns {string} Unique identifier for this game type
     */
    getEngineId() {
        throw new Error('getEngineId() must be implemented');
    }

    /**
     * Create initial game state
     * @param {Object} options - Game initialization options (difficulty, playerStarts, etc.)
     * @returns {Object} Initial game state
     */
    initializeGame(options = {}) {
        throw new Error('initializeGame() must be implemented');
    }

    /**
     * Validate if a move is legal
     * @param {Object} gameState - Current game state
     * @param {Object} move - Move to validate
     * @returns {boolean} True if move is valid
     */
    isValidMove(gameState, move) {
        throw new Error('isValidMove() must be implemented');
    }

    /**
     * Process a move and return new game state
     * @param {Object} gameState - Current game state
     * @param {Object} move - Move to process
     * @returns {Object} New game state after move
     */
    processMove(gameState, move) {
        throw new Error('processMove() must be implemented');
    }

    /**
     * Check if game is over and determine winner
     * @param {Object} gameState - Current game state
     * @returns {Object|null} { winner: string, gameOver: boolean } or null if game continues
     */
    checkGameEnd(gameState) {
        throw new Error('checkGameEnd() must be implemented');
    }

    /**
     * Serialize game state for database storage
     * @param {Object} gameState - Game state to serialize
     * @returns {Object} { boardState: string, metadata: Object }
     */
    serializeState(gameState) {
        throw new Error('serializeState() must be implemented');
    }

    /**
     * Get AI move if applicable
     * @param {Object} gameState - Current game state
     * @param {string} difficulty - AI difficulty level
     * @returns {Object|null} AI move or null if not applicable
     */
    getAIMove(gameState, difficulty = 'medium') {
        // Optional implementation - return null if game doesn't support AI
        return null;
    }

    /**
     * Get game statistics structure
     * @returns {Array} Array of stat field definitions
     */
    getStatFields() {
        return [
            { name: 'total_games', type: 'count' },
            { name: 'wins', type: 'count' },
            { name: 'losses', type: 'count' },
            { name: 'ties', type: 'count' },
            { name: 'avg_moves', type: 'average' },
            { name: 'best_score', type: 'max' }
        ];
    }

    /**
     * Get the states of a game
     * @param limit - defaults to 10 if not specified; otherwise acts as a "select top X" filter.
     * @return {null}
     */
    async getStates(limit) {
        return null;
    }
}

module.exports = GameEngineInterface;