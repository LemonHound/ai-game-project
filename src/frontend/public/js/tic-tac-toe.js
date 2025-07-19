// tic-tac-toe.js - Fixed Game logic for Tic Tac Toe
class TicTacToeGame {
    constructor() {
        this.board = Array(9).fill(null);
        this.currentPlayer = 'X'; // Player is always X
        this.gameOver = false;
        this.winner = null;
        this.moveHistory = [];
        this.gameSessionId = null;
        this.playerStarts = true; // Track who starts - can be toggled

        this.initializeBoard();
        this.updateGameStatus();
        this.updateAIThoughts("Ready for a new game! Make your first move.");

        // If AI should start, make AI move after short delay
        if (!this.playerStarts) {
            this.currentPlayer = 'O';
            this.updateGameStatus();
            this.updateAIThoughts("I'll start this game!");
            setTimeout(() => this.makeAIMove(), 500);
        }
    }

    initializeBoard() {
        const boardElement = document.getElementById('game-board');
        boardElement.innerHTML = '';

        for (let i = 0; i < 9; i++) {
            const square = document.createElement('button');
            square.className = 'btn btn-lg btn-neutral w-20 h-20 text-3xl font-bold hover:btn-primary transition-all duration-200';
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
        // Simple "AI" strategy:
        // 1. Try to win
        // 2. Try to block player from winning
        // 3. Take center if available
        // 4. Take random corner or side

        // Check for winning move
        for (let i = 0; i < 9; i++) {
            if (!this.board[i]) {
                this.board[i] = 'O';
                if (this.checkWinner(true) === 'O') {
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
                if (this.checkWinner(true) === 'X') {
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
        // Fixed: Remove btn-active to prevent styling conflicts
        if (player === 'X') {
            square.classList.remove('btn-neutral', 'hover:btn-primary');
            square.classList.add('btn-success');
        } else {
            square.classList.remove('btn-neutral', 'hover:btn-primary');
            square.classList.add('btn-error');
        }
    }

    checkWinner(aiLogic = false) {
        const winLines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
            [0, 4, 8], [2, 4, 6] // Diagonals
        ];

        for (let line of winLines) {
            const [a, b, c] = line;
            if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
                this.winner = this.board[a];
                if(!aiLogic) this.highlightWinningLine(line);
                return this.board[a];
            }
        }
        return null;
    }

    highlightWinningLine(line) {
        line.forEach(index => {
            const square = document.querySelector(`[data-index="${index}"]`);
            square.classList.add('ring-4', 'ring-warning');
        });
    }

    checkDraw() {
        return this.board.every(cell => cell !== null) && !this.winner;
    }

    endGame() {
        this.gameOver = true;
        let statusMessage = '';

        if (this.winner === 'X') {
            statusMessage = '🎉 You Won! Great job!';
            this.updateAIThoughts("Well played! You outmaneuvered me this time. 🏆");
        } else if (this.winner === 'O') {
            statusMessage = '🤖 AI Wins! Better luck next time!';
            this.updateAIThoughts("Victory! That was a strategic game. 🎯");
        } else {
            statusMessage = '🤝 It\'s a Draw! Good game!';
            this.updateAIThoughts("A well-fought draw! Neither of us could gain the advantage. ⚖️");
        }

        this.updateGameStatus(statusMessage);
    }

    updateGameStatus(message = null) {
        const statusElement = document.getElementById('game-status');
        if (message) {
            statusElement.textContent = message;
        } else if (this.gameOver) {
            statusElement.textContent = 'Game Over!';
        } else if (this.currentPlayer === 'X') {
            statusElement.textContent = 'Your turn! Choose a square.';
        } else {
            statusElement.textContent = 'AI is thinking...';
        }
    }

    updateAIThoughts(thought) {
        const aiThoughtsElement = document.getElementById('ai-thoughts');
        if (aiThoughtsElement) {
            aiThoughtsElement.textContent = thought;
        }
    }

    addMoveToHistory(player, index) {
        this.moveHistory.push({ player, square: index + 1, timestamp: new Date() });
        this.updateMoveHistory();
    }

    updateMoveHistory() {
        const historyElement = document.getElementById('move-history');
        if (historyElement) {
            if (this.moveHistory.length === 0) {
                historyElement.innerHTML = '<div class="text-sm opacity-70">No moves yet</div>';
            } else {
                historyElement.innerHTML = this.moveHistory.map((move, index) =>
                    `<div class="text-sm">
                        <span class="font-semibold">${index + 1}.</span> 
                        ${move.player} → Square ${move.square}
                    </div>`
                ).join('');
            }
        }
    }

    restart() {
        this.board = Array(9).fill(null);
        this.currentPlayer = this.playerStarts ? 'X' : 'O';
        this.gameOver = false;
        this.winner = null;
        this.moveHistory = [];

        this.initializeBoard();
        this.updateGameStatus();
        this.updateMoveHistory();
        this.updateAIThoughts("Game restarted! Ready for another round!");

        // If AI should start, make AI move after short delay
        if (!this.playerStarts) {
            this.updateAIThoughts("I'll start this round!");
            setTimeout(() => this.makeAIMove(), 500);
        }
    }

    // Toggle who starts the game
    toggleStarter() {
        this.playerStarts = !this.playerStarts;
        this.restart();
        const starterText = this.playerStarts ? "You'll start next game!" : "AI will start next game!";
        this.updateAIThoughts(starterText);
    }

    getHint() {
        if (this.gameOver || this.currentPlayer === 'O') {
            this.updateAIThoughts("No hints available right now!");
            return;
        }

        let hintMessage = "💡 Hint: ";

        // Check if player can win
        for (let i = 0; i < 9; i++) {
            if (!this.board[i]) {
                this.board[i] = 'X';
                if (this.checkWinner() === 'X') {
                    this.board[i] = null;
                    hintMessage += `You can win by playing square ${i + 1}! 🎯`;
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
                    hintMessage += `Block the AI by playing square ${i + 1}! 🛡️`;
                    this.updateAIThoughts(hintMessage);
                    return;
                }
                this.board[i] = null;
            }
        }

        // General strategy hints
        if (!this.board[4]) {
            hintMessage += "Try the center square (5) for maximum strategic advantage! 🎯";
        } else {
            const corners = [0, 2, 6, 8];
            const availableCorners = corners.filter(i => !this.board[i]);
            if (availableCorners.length > 0) {
                hintMessage += `Try a corner like square ${availableCorners[0] + 1} for better positioning! 📐`;
            } else {
                hintMessage += "Look for opportunities to create multiple winning paths! 🧠";
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

// Global functions for button handlers (called from EJS)
function startGame() {
    game = new TicTacToeGame();
}

function restartGame() {
    if (game) {
        game.restart();
    }
}

function toggleStarter() {
    if (game) {
        game.toggleStarter();
    }
}

function getHint() {
    if (game) {
        game.getHint();
    }
}

// Modal functions (from your layout's scripts.ejs)
function openModal(modalId) {
    document.getElementById(modalId).classList.add('modal-open');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('modal-open');
}