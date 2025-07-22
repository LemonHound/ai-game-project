// src/backend/game-logic/game-factory.js
const TicTacToeEngine = require('./tic-tac-toe');

class GameFactory {
    constructor() {
        this.engines = new Map();
        this._registerEngines();
    }

    _registerEngines() {
        // Register all available game engines
        const ticTacToe = new TicTacToeEngine();
        this.engines.set(ticTacToe.getEngineId(), ticTacToe);

        // Future games can be added here:
        // const snake = new SnakeEngine();
        // this.engines.set(snake.getEngineId(), snake);
    }

    getEngine(gameId) {
        const engine = this.engines.get(gameId);
        if (!engine) {
            throw new Error(`Game engine not found: ${gameId}`);
        }
        return engine;
    }

    getAvailableGames() {
        return Array.from(this.engines.keys()).map(gameId => {
            const engine = this.engines.get(gameId);
            return {
                id: gameId,
                name: this._formatGameName(gameId),
                // Add more metadata as needed
            };
        });
    }

    isValidGameId(gameId) {
        return this.engines.has(gameId);
    }

    _formatGameName(gameId) {
        return gameId.split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
}

// Export singleton instance
module.exports = new GameFactory();