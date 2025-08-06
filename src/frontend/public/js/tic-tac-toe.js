class TicTacToeGame {
    constructor() {
        this.gameSessionId = null;
        this.gameState = null;
        this.gameName = 'tic-tac-toe';
        this.isProcessingMove = false;

        this.initializeGame();

        this.waitTimeMin = 200;
        this.waitTimeMax = 1200;
    }

    async initializeGame() {
        this.initializeBoard();
        this.updateGameStatus('Starting new game...');
        this.updateAIThoughts('Checking authentication...');

        const authReady = await window.GameAuthUtils.waitForAuthManager();

        if (!authReady) {
            this.updateAIThoughts('Authentication system failed to load. Please refresh the page.');
            return;
        }

        if (!window.authManager.isAuthenticatedForGames()) {
            this.updateAIThoughts('I can only play with authenticated users - please log in first!');
            return;
        }

        this.updateAIThoughts('Starting new game...');
        await this.startGameOnServer();
    }

    async startGameOnServer() {
        const data = await window.GameAuthUtils.handleGameApiCall(async () => {
            return fetch(`/api/${this.gameName}/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    playerStarts: true,
                    difficulty: 'medium',
                }),
            });
        });

        if (data) {
            this.gameSessionId = data.sessionId;
            this.gameState = data.state;

            console.log('Game session started:', this.gameSessionId);

            // Update UI based on backend state
            this.updateUIFromState();

            // If AI should start first, it will be handled by the backend
            if (!this.gameState.playerStarts) {
                this.updateAIThoughts("I'll start this game!");

                // Simulate AI thinking time on frontend
                const thinkingTime = this.waitTimeMin + Math.random() * (this.waitTimeMax - this.waitTimeMin);
                setTimeout(() => this.makeAIMove(), thinkingTime);
            } else {
                this.updateAIThoughts('Ready for a new game! Make your first move.');
            }
        }
    }

    initializeBoard() {
        const boardElement = document.getElementById('game-board');
        boardElement.innerHTML = '';

        for (let i = 0; i < 9; i++) {
            const square = document.createElement('button');
            square.className =
                'btn btn-lg btn-neutral w-20 h-20 text-3xl font-bold hover:btn-primary transition-all duration-200';
            square.setAttribute('data-index', i);
            square.addEventListener('click', () => this.makePlayerMove(i));
            boardElement.appendChild(square);
        }
    }

    async makePlayerMove(position) {
        // Use the utility to check authentication (it will wait if needed)
        const isAuthenticated = await window.GameAuthUtils.isAuthenticated();
        if (!isAuthenticated) {
            this.updateAIThoughts('I can only play with authenticated users - please log in to continue!');
            window.GameAuthUtils.showLoginRequiredModal();
            return;
        }

        // Prevent moves during processing or if game is over
        if (this.isProcessingMove || !this.gameState || this.gameState.gameOver) {
            return;
        }

        // Check if it's the player's turn
        if (this.gameState.currentPlayer !== 'X') {
            this.updateAIThoughts("It's my turn! Please wait...");
            return;
        }

        // Check if position is valid (basic client-side validation)
        if (this.gameState.board[position] !== null) {
            this.updateAIThoughts('That square is already taken! Choose another one.');
            return;
        }

        this.isProcessingMove = true;

        try {
            await this.sendMoveToServer(position, 'X');
        } catch (error) {
            console.error('Error making player move:', error);
            this.updateAIThoughts('Something went wrong with your move. Try again!');
        } finally {
            this.isProcessingMove = false;
        }
    }

    async makeAIMove() {
        if (this.isProcessingMove || !this.gameState || this.gameState.gameOver) {
            return;
        }

        if (this.gameState.currentPlayer !== 'O') {
            return;
        }

        this.isProcessingMove = true;
        this.updateAIThoughts('Thinking...');

        const data = await window.GameAuthUtils.handleGameApiCall(async () => {
            return fetch(`/api/${this.gameName}/move`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    sessionId: this.gameSessionId,
                    move: { player: 'O', requestAIMove: true },
                }),
            });
        });

        if (data) {
            this.gameState = data.newState;
            this.updateUIFromState();

            if (data.aiMove) {
                this.updateAIThoughts(`I chose square ${data.aiMove.position + 1}. Your turn!`);
            }
        }

        this.isProcessingMove = false;
    }

    async sendMoveToServer(position, player) {
        if (!this.gameSessionId) {
            console.warn('No game session ID - cannot make move');
            return;
        }

        // Update UI with player move before making API call to back-end
        this.gameState.board[position] = this.gameState.currentPlayer;
        this.updateUIFromState();

        const data = await window.GameAuthUtils.handleGameApiCall(async () => {
            return fetch(`/api/${this.gameName}/move`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    sessionId: this.gameSessionId,
                    move: {
                        position: position,
                        player: player,
                    },
                }),
            });
        });

        if (data) {
            const aiSimWaitTime = Math.random() * (this.waitTimeMax - this.waitTimeMin) + this.waitTimeMin;
            setTimeout(async () => {
                this.gameState = data.newState;
                this.updateUIFromState();

                if (data.aiMove) {
                    // AI move was made automatically by backend
                    const aiPosition = data.aiMove.position;
                    this.updateAIThoughts(
                        `I chose square ${aiPosition + 1}. ${this.getGameEndMessage() || 'Your turn!'}`
                    );
                } else if (!this.gameState.gameOver && this.gameState.currentPlayer === 'O') {
                    await this.makeAIMove();
                }
            }, aiSimWaitTime);
        }
    }

    updateUIFromState() {
        if (!this.gameState) return;

        // Update board display
        this.gameState.board.forEach((cell, index) => {
            if (cell !== null) {
                this.updateSquare(index, cell);
            }
        });

        // Update game status
        this.updateGameStatus();

        // Update AI thoughts based on game state
        if (this.gameState.gameOver) {
            this.updateAIThoughts(this.getGameEndMessage());
        }
    }

    updateSquare(index, player) {
        const square = document.querySelector(`[data-index="${index}"]`);
        if (square && square.textContent === '') {
            square.textContent = player;
            if (player === 'X') {
                square.classList.remove('btn-neutral', 'hover:btn-primary');
                square.classList.add('btn-success');
            } else {
                square.classList.remove('btn-neutral', 'hover:btn-primary');
                square.classList.add('btn-error');
            }
        }
    }

    updateGameStatus(customMessage = null) {
        const statusElement = document.getElementById('game-status');

        if (customMessage) {
            statusElement.textContent = customMessage;
            statusElement.className = 'text-2xl font-bold text-info mb-4';
            return;
        }

        if (!this.gameState) {
            statusElement.textContent = 'Loading...';
            statusElement.className = 'text-2xl font-bold text-info mb-4';
            return;
        }

        if (this.gameState.gameOver) {
            if (this.gameState.winner === 'X') {
                statusElement.textContent = '🎉 You Win!';
                statusElement.className = 'text-2xl font-bold text-success mb-4';
            } else if (this.gameState.winner === 'O') {
                statusElement.textContent = '🤖 AI Wins!';
                statusElement.className = 'text-2xl font-bold text-error mb-4';
            } else {
                statusElement.textContent = "🤝 It's a Tie!";
                statusElement.className = 'text-2xl font-bold text-warning mb-4';
            }
        } else {
            if (this.gameState.currentPlayer === 'X') {
                statusElement.textContent = '🎯 Your Turn';
                statusElement.className = 'text-2xl font-bold text-primary mb-4';
            } else {
                statusElement.textContent = '🤖 AI Thinking...';
                statusElement.className = 'text-2xl font-bold text-secondary mb-4';
            }
        }
    }

    updateAIThoughts(thought) {
        const thoughtsElement = document.getElementById('ai-thoughts');
        if (thoughtsElement) {
            thoughtsElement.textContent = thought;
        }
    }

    getGameEndMessage() {
        if (!this.gameState || !this.gameState.gameOver) return null;

        if (this.gameState.winner === 'X') {
            return 'Well played! You won this round. Want to try again?';
        } else if (this.gameState.winner === 'O') {
            return 'I won this time! Your strategy is improving though.';
        } else {
            return "A tie! We're evenly matched. Let's play again!";
        }
    }

    async restartGame() {
        const canRestart = await window.GameAuthUtils.checkAuthBeforeAction('restart a game');
        if (!canRestart) {
            return;
        }

        // Reset local state
        this.gameSessionId = null;
        this.gameState = null;
        this.isProcessingMove = false;

        // Clear the board
        const boardElement = document.getElementById('game-board');
        const squares = boardElement.querySelectorAll('button');
        squares.forEach(square => {
            square.textContent = '';
            square.className =
                'btn btn-lg btn-neutral w-20 h-20 text-3xl font-bold hover:btn-primary transition-all duration-200';
        });

        // Start a new game
        await this.initializeGame();
    }

    async toggleFirstPlayer() {
        // TODO: Add logic for this
        this.restartGame();
    }
}

// Initialize game when page loads
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new TicTacToeGame();
});

// Global functions for buttons
function restartGame() {
    if (game) {
        game.restartGame();
    }
}

function toggleFirstPlayer() {
    if (game) {
        game.toggleFirstPlayer();
    }
}
