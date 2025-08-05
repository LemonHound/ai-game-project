const TicTacToeEngine = require('./tic-tac-toe');
const CheckersEngine = require('./checkers');

class GameFactory {
  constructor() {
    this.engines = new Map();
    this._registerEngines();
  }

  _registerEngines() {
    const ticTacToe = new TicTacToeEngine();
    this.engines.set(ticTacToe.getEngineId(), ticTacToe);

    const checkers = new CheckersEngine();
    this.engines.set(checkers.getEngineId(), checkers);
  }

  getEngine(gameId) {
    const engine = this.engines.get(gameId);
    if (!engine) {
      throw new Error(`Game engine not found: ${gameId}`);
    }
    return engine;
  }

  getAvailableGames() {
    return Array.from(this.engines.keys()).map((gameId) => {
      const engine = this.engines.get(gameId);
      return {
        id: gameId,
        name: this._formatGameName(gameId),
      };
    });
  }

  isValidGameId(gameId) {
    return this.engines.has(gameId);
  }

  _formatGameName(gameId) {
    return gameId
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

// Export singleton instance
module.exports = new GameFactory();
