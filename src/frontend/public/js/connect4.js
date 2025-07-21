// connect4.js - Fixed Game logic for Connect 4
class Connect4Game {
    constructor() {
        this.rows = 6;
        this.cols = 7;
        this.board = Array(this.rows).fill(null).map(() => Array(this.cols).fill(null));
        this.currentPlayer = 'player';
        this.gameOver = false;
        this.winner = null;
        this.winningLine = [];
        this.moveHistory = [];
        this.playerStarts = true;

        this.initializeBoard();
        this.updateGameStatus();
        this.updateAIThoughts("Ready to play Connect 4! Drop your red piece in any column.");
    }

    initializeBoard() {
        // Clear any existing boards first to prevent duplication
        const desktopBoard = document.getElementById('game-board');
        const mobileBoard = document.getElementById('mobile-game-board');
        const desktopButtons = document.getElementById('column-buttons');
        const mobileButtons = document.getElementById('mobile-column-buttons');

        if (desktopBoard) desktopBoard.innerHTML = '';
        if (mobileBoard) mobileBoard.innerHTML = '';
        if (desktopButtons) desktopButtons.innerHTML = '';
        if (mobileButtons) mobileButtons.innerHTML = '';

        // Create desktop version
        if (desktopBoard) {
            this.createColumnButtons(desktopButtons);
            this.createGameBoard(desktopBoard);
        }

        // Create mobile version
        if (mobileBoard) {
            this.createColumnButtons(mobileButtons);
            this.createGameBoard(mobileBoard);
        }
    }

    createColumnButtons(container) {
        if (!container) return;

        for (let col = 0; col < this.cols; col++) {
            const button = document.createElement('button');
            button.className = 'btn btn-primary btn-sm';
            button.textContent = '⬇️';
            button.dataset.col = col;
            button.addEventListener('click', () => this.makeMove(col));
            container.appendChild(button);
        }
    }

    createGameBoard(container) {
        if (!container) return;

        const boardDiv = document.createElement('div');
        boardDiv.className = 'bg-primary p-4 rounded-lg grid grid-cols-7 gap-1';
        boardDiv.style.width = '420px';

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const cell = document.createElement('div');
                cell.className = 'w-12 h-12 bg-base-100 rounded-full flex items-center justify-center transition-all duration-300';
                cell.dataset.row = row;
                cell.dataset.col = col;
                boardDiv.appendChild(cell);
            }
        }

        container.appendChild(boardDiv);
    }

    makeMove(col) {
        if (this.gameOver || this.currentPlayer === 'ai') return;

        const row = this.getLowestEmptyRow(col);
        if (row === -1) {
            this.updateAIThoughts("That column is full! Try another column.");
            return;
        }

        this.board[row][col] = 'player';
        this.renderBoard();
        this.addMoveToHistory('Player', col + 1);

        if (this.checkWinner(row, col, 'player')) {
            this.endGame('player');
            return;
        }

        if (this.checkDraw()) {
            this.endGame('draw');
            return;
        }

        this.currentPlayer = 'ai';
        this.updateGameStatus();
        this.updateAIThoughts("Your move looks interesting! Let me think...");

        setTimeout(() => this.makeAIMove(), 1000);
    }

    getLowestEmptyRow(col) {
        for (let row = this.rows - 1; row >= 0; row--) {
            if (this.board[row][col] === null) {
                return row;
            }
        }
        return -1;
    }

    renderBoard() {
        const cells = document.querySelectorAll('[data-row][data-col]');

        cells.forEach(cell => {
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            const piece = this.board[row][col];

            // Clear previous styling
            cell.className = 'w-12 h-12 bg-base-100 rounded-full flex items-center justify-center transition-all duration-300';
            cell.textContent = '';

            if (piece === 'player') {
                cell.classList.add('bg-error');
                cell.textContent = '🔴';
            } else if (piece === 'ai') {
                cell.classList.add('bg-blue-400');
                cell.textContent = '🔵';
            }
        });
    }

    makeAIMove() {
        if (this.gameOver || this.currentPlayer !== 'ai') return;

        const move = this.getBestAIMove();
        if (move === -1) return;

        const row = this.getLowestEmptyRow(move);
        this.board[row][move] = 'ai';
        this.renderBoard();
        this.addMoveToHistory('AI', move + 1);

        if (this.checkWinner(row, move, 'ai')) {
            this.endGame('ai');
            return;
        }

        if (this.checkDraw()) {
            this.endGame('draw');
            return;
        }

        this.currentPlayer = 'player';
        this.updateGameStatus();
        this.updateAIThoughts("Your turn! Look for opportunities to connect four pieces.");
    }

    getBestAIMove() {
        const availableCols = [];
        for (let col = 0; col < this.cols; col++) {
            if (this.getLowestEmptyRow(col) !== -1) {
                availableCols.push(col);
            }
        }

        if (availableCols.length === 0) return -1;

        // Check if AI can win
        for (let col of availableCols) {
            const row = this.getLowestEmptyRow(col);
            this.board[row][col] = 'ai';
            if (this.checkWinner(row, col, 'ai')) {
                this.board[row][col] = null;
                return col;
            }
            this.board[row][col] = null;
        }

        // Check if player needs to be blocked
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
        const preferredCols = [3, 2, 4, 1, 5, 0, 6].filter(col => availableCols.includes(col));
        return preferredCols[0];
    }

    checkWinner(row, col, player) {
        const directions = [
            [0, 1],   // horizontal
            [1, 0],   // vertical
            [1, 1],   // diagonal \
            [1, -1]   // diagonal /
        ];

        for (let [deltaRow, deltaCol] of directions) {
            let count = 1;
            let line = [{row, col}];

            // Check positive direction
            let r = row + deltaRow;
            let c = col + deltaCol;
            while (r >= 0 && r < this.rows && c >= 0 && c < this.cols && this.board[r][c] === player) {
                count++;
                line.push({row: r, col: c});
                r += deltaRow;
                c += deltaCol;
            }

            // Check negative direction
            r = row - deltaRow;
            c = col - deltaCol;
            while (r >= 0 && r < this.rows && c >= 0 && c < this.cols && this.board[r][c] === player) {
                count++;
                line.unshift({row: r, col: c});
                r -= deltaRow;
                c -= deltaCol;
            }

            if (count >= 4) {
                this.winningLine = line.slice(0, 4);
                this.highlightWinningLine();
                return true;
            }
        }

        return false;
    }

    highlightWinningLine() {
        this.winningLine.forEach(pos => {
            const cells = document.querySelectorAll(`[data-row="${pos.row}"][data-col="${pos.col}"]`);
            cells.forEach(cell => {
                cell.classList.add('ring-4', 'ring-success', 'animate-pulse');
            });
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
        const statusElements = document.querySelectorAll('#game-status, #mobile-game-status');
        const text = message || (this.gameOver ? 'Game Over!' :
            this.currentPlayer === 'player' ? 'Your turn! Choose a column to drop your red piece.' : 'AI is thinking...');

        statusElements.forEach(el => {
            if (el) el.textContent = text;
        });
    }

    updateAIThoughts(thought) {
        const aiThoughtsElement = document.getElementById('ai-thoughts');
        if (aiThoughtsElement) {
            aiThoughtsElement.textContent = thought;
        }
    }

    addMoveToHistory(player, col) {
        this.moveHistory.push({ player, move: `Column ${col}`, timestamp: new Date() });
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
        this.updateAIThoughts("Game restarted! Ready for another round of Connect 4!");

        if (!this.playerStarts) {
            this.updateAIThoughts("I'll start this round!");
            setTimeout(() => this.makeAIMove(), 500);
        }
    }

    getHint() {
        if (this.gameOver || this.currentPlayer === 'ai') {
            this.updateAIThoughts("No hints available right now!");
            return;
        }

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
                this.updateAIThoughts(`💡 Hint: You can win by playing column ${col + 1}! 🎯`);
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
                this.updateAIThoughts(`💡 Hint: Block me by playing column ${col + 1}! 🛡️`);
                return;
            }
            this.board[row][col] = null;
        }

        // General strategy hint
        if (availableCols.includes(3)) {
            this.updateAIThoughts("💡 Hint: Try the center column (4) for better control! 🎯");
        } else {
            const preferredCols = [2, 4, 1, 5].filter(col => availableCols.includes(col));
            if (preferredCols.length > 0) {
                this.updateAIThoughts(`💡 Hint: Try column ${preferredCols[0] + 1} for good positioning! 📐`);
            } else {
                this.updateAIThoughts("💡 Hint: Look for opportunities to build multiple threats! 🧠");
            }
        }
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
    game = new Connect4Game();
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