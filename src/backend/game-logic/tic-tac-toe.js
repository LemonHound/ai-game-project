// src/backend/game-logic/tic-tac-toe.js
const GameEngineInterface = require('./game-engine-interface');

class TicTacToeEngine extends GameEngineInterface {
    constructor() {
        super();
        this.engine_id = 'tic-tac-toe';
        this.winningLines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
            [0, 4, 8], [2, 4, 6] // diagonals
        ];
    }

    getEngineId() {
        return this.engine_id;
    }

    initializeGame(options = {}) {
        const playerStarts = options.playerStarts !== false; // Default true
        const difficulty = options.difficulty || 'medium';

        return {
            gameId: this.engine_id,
            board: Array(9).fill(null),
            currentPlayer: playerStarts ? 'X' : 'O',
            gameOver: false,
            winner: null,
            moveHistory: [],
            playerStarts,
            difficulty,
            moveCount: 0,
            createdAt: new Date().toISOString()
        };
    }

    isValidMove(gameState, move) {
        const movePosition = move.position;

        // Check if game is over
        if (gameState.gameOver) {
            return false;
        }

        // Check if position is valid
        if (movePosition < 0 || movePosition > 8) {
            return false;
        }

        // Check if position is empty
        return gameState.board[movePosition] === null;
    }

    processMove(gameState, move) {
        if (!this.isValidMove(gameState, move)) {
            throw new Error('Invalid move');
        }

        const newState = JSON.parse(JSON.stringify(gameState));
        const movePosition = move.position;

        // Make the move
        newState.board[movePosition] = newState.currentPlayer;
        newState.moveCount++;

        // Add to move history
        newState.moveHistory.push({
            player: newState.currentPlayer,
            position: movePosition,
            timestamp: new Date().toISOString(),
            moveNumber: newState.moveCount
        });

        // Check for game end
        const gameEnd = this.checkGameEnd(newState);
        if (gameEnd) {
            newState.gameOver = gameEnd.gameOver;
            newState.winner = gameEnd.winner;
        } else {
            // Switch players
            newState.currentPlayer = newState.currentPlayer === 'X' ? 'O' : 'X';
        }

        return newState;
    }

    checkGameEnd(gameState) {
        // Check for winner
        for (let line of this.winningLines) {
            const [a, b, c] = line;
            if (gameState.board[a] &&
                gameState.board[a] === gameState.board[b] &&
                gameState.board[a] === gameState.board[c]) {
                return {
                    gameOver: true,
                    winner: gameState.board[a]
                };
            }
        }

        // Check for tie
        if (gameState.board.every(cell => cell !== null)) {
            return {
                gameOver: true,
                winner: 'tie'
            };
        }

        return null; // Game continues
    }

    serializeState(gameState) {
        const boardState = gameState.board.map(cell => cell || '_').join('');
        const moveSequence = gameState.moveHistory
            .map(move => `${move.player}:${move.position}`)
            .join(',');

        return {
            boardState,
            metadata: {
                moveSequence,
                moveCount: gameState.moveCount,
                difficulty: gameState.difficulty,
                playerStarts: gameState.playerStarts
            }
        };
    }

    getAIMove(gameState, difficulty = 'medium') {
        if (gameState.currentPlayer !== 'O' || gameState.gameOver) {
            return null;
        }

        const availablePositions = gameState.board
            .map((cell, index) => cell === null ? index : null)
            .filter(pos => pos !== null);

        if (availablePositions.length === 0) {
            return null;
        }

        switch (difficulty) {
            case 'easy':
                return { position: this._getRandomMove(availablePositions) };
            case 'medium':
                return { position: this._getMediumMove(gameState, availablePositions) };
            case 'hard':
                return { position: this._getBestMove(gameState, availablePositions) };
            default:
                return { position: this._getMediumMove(gameState, availablePositions) };
        }
    }

    _getRandomMove(availablePositions) {
        return availablePositions[Math.floor(Math.random() * availablePositions.length)];
    }

    _getMediumMove(gameState, availablePositions) {
        // Try to win first
        const winMove = this._findWinningMove(gameState, 'O');
        if (winMove !== null) return winMove;

        // Try to block player win
        const blockMove = this._findWinningMove(gameState, 'X');
        if (blockMove !== null) return blockMove;

        // Take center if available
        if (availablePositions.includes(4)) return 4;

        // Take corners
        const corners = [0, 2, 6, 8].filter(pos => availablePositions.includes(pos));
        if (corners.length > 0) {
            return corners[Math.floor(Math.random() * corners.length)];
        }

        // Take any remaining position
        return this._getRandomMove(availablePositions);
    }

    _getBestMove(gameState, availablePositions) {
        let bestScore = -Infinity;
        let bestMove = availablePositions[0];

        for (let pos of availablePositions) {
            const testBoard = [...gameState.board];
            testBoard[pos] = 'O';
            const score = this._minimax(testBoard, 0, false);
            if (score > bestScore) {
                bestScore = score;
                bestMove = pos;
            }
        }

        return bestMove;
    }

    _findWinningMove(gameState, player) {
        for (let line of this.winningLines) {
            const [a, b, c] = line;
            const positions = [gameState.board[a], gameState.board[b], gameState.board[c]];

            if (positions.filter(p => p === player).length === 2 &&
                positions.filter(p => p === null).length === 1) {
                // Found a winning opportunity
                if (gameState.board[a] === null) return a;
                if (gameState.board[b] === null) return b;
                if (gameState.board[c] === null) return c;
            }
        }
        return null;
    }

    _minimax(board, depth, isMaximizing) {
        const winner = this._checkWinner(board);
        if (winner === 'O') return 1;
        if (winner === 'X') return -1;
        if (board.every(cell => cell !== null)) return 0;

        if (isMaximizing) {
            let bestScore = -Infinity;
            for (let i = 0; i < 9; i++) {
                if (board[i] === null) {
                    board[i] = 'O';
                    const score = this._minimax(board, depth + 1, false);
                    board[i] = null;
                    bestScore = Math.max(score, bestScore);
                }
            }
            return bestScore;
        } else {
            let bestScore = Infinity;
            for (let i = 0; i < 9; i++) {
                if (board[i] === null) {
                    board[i] = 'X';
                    const score = this._minimax(board, depth + 1, true);
                    board[i] = null;
                    bestScore = Math.min(score, bestScore);
                }
            }
            return bestScore;
        }
    }

    _checkWinner(board) {
        for (let line of this.winningLines) {
            const [a, b, c] = line;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return board[a];
            }
        }
        return null;
    }

    getStatFields() {
        return [
            { name: 'total_games', type: 'count', label: 'Total Games' },
            { name: 'wins', type: 'count', label: 'Wins' },
            { name: 'losses', type: 'count', label: 'Losses' },
            { name: 'ties', type: 'count', label: 'Ties' },
            { name: 'avg_moves', type: 'average', label: 'Average Moves' },
            { name: 'win_rate', type: 'percentage', label: 'Win Rate' },
            { name: 'incomplete_games', type: 'count', label: 'Incomplete Games' }
        ];
    }
}

module.exports = TicTacToeEngine;