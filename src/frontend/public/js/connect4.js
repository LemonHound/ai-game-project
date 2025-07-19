// connect4.js - Game logic for Connect 4
class Connect4Game {
    constructor() {
        this.rows = 6;
        this.cols = 7;
        this.board = Array(this.rows).fill(null).map(() => Array(this.cols).fill(null));
        this.currentPlayer = 'player'; // 'player' or 'ai'
        this.gameOver = false;
        this.winner = null;
        this.winningLine = [];
        this.moveHistory = [];
        this.playerStarts = true;

        this.initializeBoard();
        this.updateGameStatus();
        this.updateAIThoughts("Ready to play Connect 4! Drop your red piece in any column.");

        // If AI should start, make AI move after short delay
        if (!this.playerStarts) {
            this.currentPlayer = 'ai';
            this.updateGameStatus();
            this.updateAIThoughts("I'll start this game!");
            setTimeout(() => this.makeAIMove(), 500);
        }
    }

    initializeBoard() {
        const boardElement = document.getElementById('game-board');
        boardElement.innerHTML = '';
        boardElement.className = 'grid grid-cols-7 gap-2 max-w-md mx-auto bg-primary p-4 rounded-lg';

        // Create column buttons for dropping pieces
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'grid grid-cols-7 gap-2 max-w-md mx-auto mb-4';

        for (let col = 0; col < this.cols; col++) {
            const button = document.createElement('button');
            button.className = 'btn btn-sm btn-outline hover:btn-primary';
            button.textContent = '↓';
            button.addEventListener('click', () => this.makeMove(col));
            button.dataset.col = col;
            controlsDiv.appendChild(button);
        }

        boardElement.parentElement.insertBefore(controlsDiv, boardElement);

        // Create the game grid
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const cell = document.createElement('div');
                cell.className = 'w-8 h-8 bg-base-100 rounded-full border-2 border-base-300 flex items-center justify-center transition-all duration-300';
                cell.dataset.row = row;
                cell.dataset.col = col;
                boardElement.appendChild(cell);
            }
        }
    }

    makeMove(col) {
        if (this.gameOver || this.currentPlayer === 'ai') return;

        const row = this.getLowestEmptyRow(col);
        if (row === -1) return; // Column is full

        // Drop the piece with animation
        this.dropPiece(row, col, 'player');
        this.board[row][col] = 'player';
        this.addMoveToHistory('Player', col + 1);

        // Check for win or draw
        if (this.checkWinner(row, col, 'player')) {
            this.endGame('player');
            return;
        }

        if (this.checkDraw()) {
            this.endGame('draw');
            return;
        }

        // Switch to AI turn
        this.currentPlayer = 'ai';
        this.updateGameStatus();
        this.updateAIThoughts("Analyzing the board... Looking for the best move.");

        setTimeout(() => this.makeAIMove(), 1200);
    }

    makeAIMove() {
        if (this.gameOver || this.currentPlayer !== 'ai') return;

        const col = this.getBestAIMove();
        const row = this.getLowestEmptyRow(col);

        if (row === -1) return; // Should not happen with proper AI

        // Drop the piece with animation
        this.dropPiece(row, col, 'ai');
        this.board[row][col] = 'ai';
        this.addMoveToHistory('AI', col + 1);

        // Check for win or draw
        if (this.checkWinner(row, col, 'ai')) {
            this.endGame('ai');
            return;
        }

        if (this.checkDraw()) {
            this.endGame('draw');
            return;
        }

        // Switch back to player
        this.currentPlayer = 'player';
        this.updateGameStatus();
        this.updateAIThoughts("Your turn! I'm ready for your next move.");
    }

    getLowestEmptyRow(col) {
        for (let row = this.rows - 1; row >= 0; row--) {
            if (this.board[row][col] === null) {
                return row;
            }
        }
        return -1; // Column is full
    }

    dropPiece(row, col, player) {
        const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        const piece = document.createElement('div');

        piece.className = `w-6 h-6 rounded-full ${player === 'player' ? 'bg-error' : 'bg-warning'} animate-bounce`;
        piece.style.animation = 'bounce 0.5s ease-out';

        cell.appendChild(piece);

        // Update column button state
        const colButton = document.querySelector(`[data-col="${col}"]`);
        if (this.getLowestEmptyRow(col) === -1) {
            colButton.disabled = true;
            colButton.classList.add('btn-disabled');
        }
    }

    getBestAIMove() {
        // AI Strategy using minimax-like approach:
        // 1. Win if possible
        // 2. Block player from winning
        // 3. Play center columns when possible
        // 4. Random valid move

        const availableCols = [];
        for (let col = 0; col < this.cols; col++) {
            if (this.getLowestEmptyRow(col) !== -1) {
                availableCols.push(col);
            }
        }

        // Check for winning move
        for (let col of availableCols) {
            const row = this.getLowestEmptyRow(col);
            this.board[row][col] = 'ai';
            if (this.checkWinner(row, col, 'ai')) {
                this.board[row][col] = null;
                return col;
            }
            this.board[row][col] = null;
        }

        // Check for blocking move
        for (let col of availableCols) {
            const row = this.getLowestEmptyRow(col);
            this.board[row][col] = 'player';
            if (this.checkWinner(row, col, 'player')) {
                this.board[row][col] = null;
                return col;
            }
            this.board[row][col] = null;
        }

        // Prefer center columns
        const centerCols = [3, 2, 4, 1, 5, 0, 6];
        for (let col of centerCols) {
            if (availableCols.includes(col)) {
                return col;
            }
        }

        // Random fallback
        return availableCols[Math.floor(Math.random() * availableCols.length)];
    }

    checkWinner(row, col, player) {
        const directions = [
            [0, 1],   // Horizontal
            [1, 0],   // Vertical
            [1, 1],   // Diagonal /
            [1, -1]   // Diagonal \
        ];

        for (let [deltaRow, deltaCol] of directions) {
            let count = 1; // Count the current piece
            const line = [{row, col}];

            // Check in positive direction
            let r = row + deltaRow;
            let c = col + deltaCol;
            while (r >= 0 && r < this.rows && c >= 0 && c < this.cols && this.board[r][c] === player) {
                count++;
                line.push({row: r, col: c});
                r += deltaRow;
                c += deltaCol;
            }

            // Check in negative direction
            r = row - deltaRow;
            c = col - deltaCol;
            while (r >= 0 && r < this.rows && c >= 0 && c < this.cols && this.board[r][c] === player) {
                count++;
                line.unshift({row: r, col: c});
                r -= deltaRow;
                c -= deltaCol;
            }

            if (count >= 4) {
                this.winningLine = line.slice(0, 4); // Take first 4 pieces
                this.highlightWinningLine();
                return true;
            }
        }

        return false;
    }

    highlightWinningLine() {
        this.winningLine.forEach(pos => {
            const cell = document.querySelector(`[data-row="${pos.row}"][data-col="${pos.col}"]`);
            cell.classList.add('ring-4', 'ring-success', 'animate-pulse');
        });
    }

    checkDraw() {
        for (let col = 0; col < this.cols; col++) {
            if (this.getLowestEmptyRow(col) !== -1) {
                return false;
            }
        }
        return true;
    }

    endGame(result) {
        this.gameOver = true;
        let statusMessage = '';

        if (result === 'player') {
            statusMessage = '🎉 You Win! Four in a row!';
            this.updateAIThoughts("Excellent strategy! You connected four before me. Well played! 🏆");
        } else if (result === 'ai') {
            statusMessage = '🤖 AI Wins! Four in a row!';
            this.updateAIThoughts("Victory! I managed to connect four pieces. Good game! 🎯");
        } else {
            statusMessage = '🤝 It\'s a Draw! Board is full!';
            this.updateAIThoughts("A tie game! The board filled up without either of us connecting four. ⚖️");
        }

        this.updateGameStatus(statusMessage);

        // Disable all column buttons
        document.querySelectorAll('[data-col]').forEach(btn => {
            btn.disabled = true;
            btn.classList.add('btn-disabled');
        });
    }

    updateGameStatus(message = null) {
        const statusElement = document.getElementById('game-status');
        if (message) {
            statusElement.textContent = message;
        } else if (this.gameOver) {
            statusElement.textContent = 'Game Over!';
        } else if (this.currentPlayer === 'player') {
            statusElement.textContent = 'Your turn! Choose a column to drop your red piece.';
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

    addMoveToHistory(player, col) {
        this.moveHistory.push({ player, move: `Column ${col}`, timestamp: new Date() });
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
                        ${move.player} → ${move.move}
                    </div>`
                ).join('');
            }
        }
    }

    restart() {
        this.board = Array(this.rows).fill(null).map(() => Array(this.cols).fill(null));
        this.currentPlayer = this.playerStarts ? 'player' : 'ai';
        this.gameOver = false;
        this.winner = null;
        this.winningLine = [];
        this.moveHistory = [];

        this.initializeBoard();
        this.updateGameStatus();
        this.updateMoveHistory();
        this.updateAIThoughts("Game restarted! Ready for another round of Connect 4!");

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
        if (this.gameOver || this.currentPlayer === 'ai') {
            this.updateAIThoughts("No hints available right now!");
            return;
        }

        let hintMessage = "💡 Hint: ";

        const availableCols = [];
        for (let col = 0; col < this.cols; col++) {
            if (this.getLowestEmptyRow(col) !== -1) {
                availableCols.push(col);
            }
        }

        // Check if player can win
        for (let col of availableCols) {
            const row = this.getLowestEmptyRow(col);
            this.board[row][col] = 'player';
            if (this.checkWinner(row, col, 'player')) {
                this.board[row][col] = null;
                hintMessage += `You can win by playing column ${col + 1}! 🎯`;
                this.updateAIThoughts(hintMessage);
                return;
            }
            this.board[row][col] = null;
        }

        // Check if player needs to block
        for (let col of availableCols) {
            const row = this.getLowestEmptyRow(col);
            this.board[row][col] = 'ai';
            if (this.checkWinner(row, col, 'ai')) {
                this.board[row][col] = null;
                hintMessage += `Block me by playing column ${col + 1}! 🛡️`;
                this.updateAIThoughts(hintMessage);
                return;
            }
            this.board[row][col] = null;
        }

        // General strategy hint
        if (availableCols.includes(3)) {
            hintMessage += "Try the center column (4) for better control! 🎯";
        } else {
            const preferredCols = [2, 4, 1, 5].filter(col => availableCols.includes(col));
            if (preferredCols.length > 0) {
                hintMessage += `Try column ${preferredCols[0] + 1} for good positioning! 📐`;
            } else {
                hintMessage += "Look for opportunities to build multiple threats! 🧠";
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
    game = new Connect4Game();
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