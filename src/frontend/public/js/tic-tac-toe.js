// tic-tac-toe.js - Game logic for Tic Tac Toe
class TicTacToeGame {
    constructor() {
        this.board = Array(9).fill(null);
        this.currentPlayer = 'X'; // Player is always X
        this.gameOver = false;
        this.winner = null;
        this.moveHistory = [];
        this.gameSessionId = null;

        this.initializeBoard();
        this.updateGameStatus();
    }

    initializeBoard() {
        const boardElement = document.getElementById('game-board');
        boardElement.innerHTML = '';

        for (let i = 0; i < 9; i++) {
            const square = document.createElement('div');
            square.className = 'btn btn-lg btn-square bg-base-100 border-2 border-base-300 hover:border-primary text-2xl font-bold transition-all duration-200';
            square.setAttribute('data-index', i);
            square.addEventListener('click', () => this.makeMove(i));
            boardElement.appendChild(square);
        }
    }

    async makeMove(index) {
        if (this.board[index] || this.gameOver || this.currentPlayer === 'O') {
            return; // Invalid move or not player's turn
        }

        // Make player move
        this.board[index] = 'X';
        this.updateSquare(index, 'X');
        this.addMoveToHistory('Player', index);

        // Check for game end
        if (this.checkWinner() || this.checkDraw()) {
            this.endGame();
            return;
        }

        // Switch to AI turn
        this.currentPlayer = 'O';
        this.updateGameStatus();
        this.updateAIThoughts("Thinking...");

        // Simulate AI thinking delay
        setTimeout(async () => {
            await this.makeAIMove();
        }, 1000);
    }

    async makeAIMove() {
        // For now, use simple AI logic (can be enhanced with API calls later)
        const aiMove = this.getBestAIMove();

        if (aiMove !== -1) {
            this.board[aiMove] = 'O';
            this.updateSquare(aiMove, 'O');
            this.addMoveToHistory('AI', aiMove);
            this.updateAIThoughts("I chose square " + (aiMove + 1) + " to counter your strategy.");

            // Check for game end
            if (this.checkWinner() || this.checkDraw()) {
                this.endGame();
                return;
            }

            // Switch back to player
            this.currentPlayer = 'X';
            this.updateGameStatus();
        }
    }

    getBestAIMove() {
        // Simple AI strategy:
        // 1. Try to win
        // 2. Try to block player from winning
        // 3. Take center if available
        // 4. Take random corner or side

        // Check for winning move
        for (let i = 0; i < 9; i++) {
            if (!this.board[i]) {
                this.board[i] = 'O';
                if (this.checkWinner() === 'O') {
                    this.board[i] = null;
                    return i;
                }
                this.board[i] = null;
            }
        }

        // Check for blocking move
        for (let i = 0; i < 9; i++) {
            if (!this.board[i]) {
                this.board[i] = 'X';
                if (this.checkWinner() === 'X') {
                    this.board[i] = null;
                    return i;
                }
                this.board[i] = null;
            }
        }

        // Take center if available
        if (!this.board[4]) {
            return 4;
        }

        // Take corners
        const corners = [0, 2, 6, 8];
        const availableCorners = corners.filter(i => !this.board[i]);
        if (availableCorners.length > 0) {
            return availableCorners[Math.floor(Math.random() * availableCorners.length)];
        }

        // Take any available side
        const sides = [1, 3, 5, 7];
        const availableSides = sides.filter(i => !this.board[i]);
        if (availableSides.length > 0) {
            return availableSides[Math.floor(Math.random() * availableSides.length)];
        }

        return -1; // No moves available
    }

    updateSquare(index, player) {
        const square = document.querySelector(`[data-index="${index}"]`);
        square.textContent = player;
        square.classList.add(player === 'X' ? 'btn-primary' : 'btn-secondary');
        square.classList.remove('btn-square', 'hover:border-primary');
    }

    checkWinner() {
        const winLines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
            [0, 4, 8], [2, 4, 6] // Diagonals
        ];

        for (let line of winLines) {
            const [a, b, c] = line;
            if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
                this.winner = this.board[a];
                this.highlightWinningLine(line);
                return this.board[a];
            }
        }
        return null;
    }

    checkDraw() {
        return this.board.every(square => square !== null) && !this.winner;
    }

    highlightWinningLine(line) {
        line.forEach(index => {
            const square = document.querySelector(`[data-index="${index}"]`);
            square.classList.add('btn-success');
        });
    }

    endGame() {
        this.gameOver = true;
        this.updateGameStatus();
        this.updateAIThoughts(this.getEndGameMessage());
    }

    getEndGameMessage() {
        if (this.winner === 'X') {
            return "Congratulations! You won this round. I'll learn from this game.";
        } else if (this.winner === 'O') {
            return "I won this time! Good game. Ready for another round?";
        } else {
            return "It's a draw! Well played. That was a strategic game.";
        }
    }

    updateGameStatus() {
        const statusElement = document.getElementById('game-status');
        const currentPlayerElement = document.querySelector('.card-body .flex.items-center.gap-3');

        if (this.gameOver) {
            if (this.winner === 'X') {
                statusElement.textContent = "🎉 You won! Great job!";
                statusElement.className = "text-lg font-semibold mb-4 text-success";
            } else if (this.winner === 'O') {
                statusElement.textContent = "🤖 AI wins this round!";
                statusElement.className = "text-lg font-semibold mb-4 text-error";
            } else {
                statusElement.textContent = "🤝 It's a draw!";
                statusElement.className = "text-lg font-semibold mb-4 text-warning";
            }
        } else {
            if (this.currentPlayer === 'X') {
                statusElement.textContent = "Your turn! Choose a square.";
                statusElement.className = "text-lg font-semibold mb-4 text-primary";
            } else {
                statusElement.textContent = "AI is thinking...";
                statusElement.className = "text-lg font-semibold mb-4 text-secondary";
            }
        }

        // Update current player indicator
        if (currentPlayerElement) {
            const playerIcon = currentPlayerElement.querySelector('.w-8.h-8');
            const playerText = currentPlayerElement.querySelector('span');

            if (this.gameOver) {
                playerIcon.innerHTML = '<span class="text-primary-content font-bold">🏁</span>';
                playerText.textContent = 'Game Over';
            } else if (this.currentPlayer === 'X') {
                playerIcon.innerHTML = '<span class="text-primary-content font-bold">X</span>';
                playerText.textContent = 'Your Turn';
            } else {
                playerIcon.innerHTML = '<span class="text-primary-content font-bold">O</span>';
                playerText.textContent = 'AI Turn';
            }
        }
    }

    updateAIThoughts(message) {
        const aiThoughtsElement = document.getElementById('ai-thoughts');
        if (aiThoughtsElement) {
            aiThoughtsElement.textContent = message;
        }
    }

    addMoveToHistory(player, index) {
        this.moveHistory.push({ player, index, turn: this.moveHistory.length + 1 });
        this.updateMoveHistory();
    }

    updateMoveHistory() {
        const historyElement = document.getElementById('move-history');
        if (!historyElement) return;

        historyElement.innerHTML = '';
        this.moveHistory.forEach(move => {
            const moveDiv = document.createElement('div');
            moveDiv.className = 'text-sm flex justify-between items-center py-1';
            moveDiv.innerHTML = `
                <span>${move.turn}. ${move.player}</span>
                <span class="badge badge-outline badge-sm">Square ${move.index + 1}</span>
            `;
            historyElement.appendChild(moveDiv);
        });

        // Scroll to bottom
        historyElement.scrollTop = historyElement.scrollHeight;
    }

    restart() {
        this.board = Array(9).fill(null);
        this.currentPlayer = 'X';
        this.gameOver = false;
        this.winner = null;
        this.moveHistory = [];
        this.initializeBoard();
        this.updateGameStatus();
        this.updateAIThoughts("Ready for a new game! Make your first move.");
        this.updateMoveHistory();
    }

    getHint() {
        if (this.gameOver || this.currentPlayer !== 'X') {
            return;
        }

        // Simple hint: suggest a strategic move
        let hintMessage = "💡 ";

        // Check if player can win
        for (let i = 0; i < 9; i++) {
            if (!this.board[i]) {
                this.board[i] = 'X';
                if (this.checkWinner() === 'X') {
                    this.board[i] = null;
                    hintMessage += `You can win by playing square ${i + 1}!`;
                    this.updateAIThoughts(hintMessage);
                    return;
                }
                this.board[i] = null;
            }
        }

        // Check if player needs to block
        for (let i = 0; i < 9; i++) {
            if (!this.board[i]) {
                this.board[i] = 'O';
                if (this.checkWinner() === 'O') {
                    this.board[i] = null;
                    hintMessage += `Block the AI by playing square ${i + 1}!`;
                    this.updateAIThoughts(hintMessage);
                    return;
                }
                this.board[i] = null;
            }
        }

        // General strategic hints
        if (!this.board[4]) {
            hintMessage += "The center (square 5) is usually a good strategic choice!";
        } else {
            const corners = [0, 2, 6, 8];
            const availableCorners = corners.filter(i => !this.board[i]);
            if (availableCorners.length > 0) {
                hintMessage += `Try a corner like square ${availableCorners[0] + 1} for better positioning!`;
            } else {
                hintMessage += "Look for opportunities to create multiple winning paths!";
            }
        }

        this.updateAIThoughts(hintMessage);
    }
}

// Global game instance
let game = null;

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', function() {
    startGame();
});

// Global functions for button handlers
function startGame() {
    game = new TicTacToeGame();
}

function restartGame() {
    if (game) {
        game.restart();
    }
}

function getHint() {
    if (game) {
        game.getHint();
    }
}