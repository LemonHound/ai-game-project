async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/me', {
            credentials: 'include',
            headers: { Accept: 'application/json' },
            cache: 'no-cache',
        });

        if (response.ok) {
            showGameContainer();
            // Initialize game after auth confirmed
            game = new CheckersGame();
        } else {
            console.log('Not authenticated');
            showAuthGate();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        showAuthGate();
    }
}

function showAuthGate() {
    const authGate = document.getElementById('auth-gate');
    const gameContainer = document.getElementById('game-container');
    if (authGate) authGate.classList.remove('hidden');
    if (gameContainer) gameContainer.classList.add('hidden');
}

function showGameContainer() {
    const authGate = document.getElementById('auth-gate');
    const gameContainer = document.getElementById('game-container');
    if (authGate) authGate.classList.add('hidden');
    if (gameContainer) gameContainer.classList.remove('hidden');
}

function openLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.showModal();
}

class CheckersGame {
    constructor() {
        this.gameSessionId = null;
        this.gameState = null;
        this.gameName = 'checkers';
        this.isProcessingMove = false;
        this.selectedSquare = null;
        this.validMoves = [];
        this.pendingMoveChain = [];
        this.lastMoveHighlight = [];

        // AI Emulator Settings
        this.waitTimeMin = 500;
        this.waitTimeMax = 2400;

        this.initializeGame();
    }

    async initializeGame() {
        this.initializeBoard();
        this.updateGameStatus('Starting new checkers game...');
        this.updateAIThoughts('Setting up the checkers board...');
        await this.startGameOnServer();
    }

    async startGameOnServer() {
        try {
            const response = await fetch(`/api/game/checkers/start`, {
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

            if (!response.ok) {
                const errorData = await response.json();
                this.updateAIThoughts(errorData.message || 'Failed to start game. Please try again.');
                return;
            }

            const data = await response.json();
            this.gameSessionId = data.sessionId;
            this.gameState = data.state;

            this.updateUIFromState();

            if (!this.gameState.playerStarts) {
                this.updateAIThoughts("I'll start this game!");
                // AI would make first move here if needed
            } else {
                this.updateAIThoughts(
                    'Ready for checkers! Click a red piece to select it, then click where you want to move.'
                );
            }
        } catch (error) {
            console.error('Failed to start game:', error);
            this.updateAIThoughts('Failed to connect to game server. Please refresh and try again.');
        }
    }

    indexToRowCol(index) {
        const row = Math.floor(index / 8);
        const col = Math.floor(index % 8);
        return { row, col };
    }

    rowColToIndex(row, col) {
        if ((row + col) % 2 === 0) return -1; // Not a playable square
        return row * 8 + col;
    }

    initializeBoard() {
        const boardElement = document.getElementById('game-board');
        boardElement.innerHTML = '';
        boardElement.className = 'grid grid-cols-8 gap-0 border-4 border-amber-800 mx-auto';
        boardElement.style.width = '480px';
        boardElement.style.height = '480px';

        // Create 8x8 checkers board
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                const index = row * 8 + col;
                let isPlayable = false;
                if (row % 2 === 0) {
                    isPlayable = col % 2 === 1;
                } else {
                    isPlayable = col % 2 === 0;
                }

                square.className = isPlayable
                    ? 'w-15 h-15 bg-amber-900 border border-amber-800 flex items-center justify-center cursor-pointer hover:bg-amber-800 transition-colors'
                    : 'w-15 h-15 bg-amber-200 border border-amber-800 flex items-center justify-center';

                square.style.width = '60px';
                square.style.height = '60px';
                square.setAttribute('data-index', index);
                square.setAttribute('data-row', row);
                square.setAttribute('data-col', col);

                if (isPlayable) {
                    square.addEventListener('click', () => this.handleSquareClick(index));
                }

                boardElement.appendChild(square);
            }
        }
    }

    async handleSquareClick(index) {
        if (this.isProcessingMove || !this.gameState || this.gameState.gameOver) {
            return;
        }

        if (this.gameState.currentPlayer !== 'R') {
            this.updateAIThoughts("It's my turn! Please wait...");
            return;
        }

        const piece = this.gameState.board[index];

        // If clicking on own piece, select it
        if (this.isPieceOwnedByPlayer(piece)) {
            this.selectSquare(index);
            return;
        }

        // If clicking on empty square with a piece selected, try to move
        if (this.selectedSquare !== null && piece === '_') {
            await this.attemptMove(this.selectedSquare, index);
            return;
        }

        // Clear selection if clicking elsewhere
        this.clearSelection();
    }

    isPieceOwnedByPlayer(piece) {
        return piece === 'R' || piece === 'r'; // Red pieces and red kings
    }

    selectSquare(index) {
        this.clearSelection();

        this.selectedSquare = index;
        const square = document.querySelector(`[data-index="${index}"]`);
        square.classList.add('ring-4', 'ring-blue-400', 'ring-inset', 'selected-index');

        this.highlightValidMoves(index);

        // Check if this piece has valid moves
        if (this.validMoves.length === 0) {
            const anyCapturesAvailable = this.hasAnyCapturesAvailable();
            if (anyCapturesAvailable) {
                this.updateAIThoughts('You must capture when possible! Select a piece that can capture.');
            } else {
                this.updateAIThoughts('This piece has no valid moves.');
            }
        } else {
            const piece = this.gameState.board[index];
            const pieceType = piece === 'R' ? 'piece' : 'king';
            this.updateAIThoughts(`Selected your ${pieceType}. Click on a highlighted square to move.`);
        }
    }

    clearSelection() {
        document.querySelectorAll('.selected-index').forEach(element => {
            element.classList.remove('ring-4', 'ring-blue-400', 'ring-inset', 'selected-index');
        });

        // Clear move highlights
        document.querySelectorAll('.move-highlight').forEach(element => {
            element.classList.remove('bg-green-400', 'move-highlight', 'ring-4', 'ring-green-500');
            element.style.backgroundColor = '';
        });

        this.selectedSquare = null;
        this.validMoves = [];
    }

    highlightValidMoves(fromIndex) {
        this.validMoves = this.calculateValidMovesForPiece(fromIndex);

        // Clear any existing highlights first
        document.querySelectorAll('.move-highlight').forEach(element => {
            element.classList.remove('bg-green-400', 'move-highlight', 'ring-4', 'ring-green-500');
        });

        // Highlight all valid move destinations
        this.validMoves.forEach(move => {
            const square = document.querySelector(`[data-index="${move.to}"]`);
            if (square) {
                square.classList.add('move-highlight', 'ring-4', 'ring-green-500');
                // Add a subtle background tint
                square.style.backgroundColor = 'rgba(34, 197, 94, 0.3)';
            }
        });
    }

    calculateValidMovesForPiece(fromIndex) {
        if (!this.gameState) return [];

        const piece = this.gameState.board[fromIndex];
        const fromRow = Math.floor(fromIndex / 8);
        const fromCol = fromIndex % 8;

        if (piece === '_' || (piece !== 'R' && piece !== 'r')) return [];

        // First check if this piece has any captures
        const captures = this.calculateCapturesForPiece(fromIndex);

        // If ANY captures are available anywhere on the board, only return capture moves
        if (this.hasAnyCapturesAvailable()) {
            return captures;
        }

        // No captures available anywhere, so calculate normal moves
        const moves = [];

        // Determine valid directions based on piece type
        let directions = [];
        if (piece === 'R') {
            directions = [[-1, -1], [-1, 1]];
        } else if (piece === 'r') {
            directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        }

        // Check normal moves
        for (const [dr, dc] of directions) {
            const newRow = fromRow + dr;
            const newCol = fromCol + dc;

            if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
                const newIndex = newRow * 8 + newCol;

                // Only dark squares are playable
                if ((newRow + newCol) % 2 === 1 && this.gameState.board[newIndex] === '_') {
                    moves.push({
                        from: fromIndex,
                        to: newIndex,
                        captures: []
                    });
                }
            }
        }

        return moves;
    }

    async attemptMove(fromSquare, toSquare) {
        if (this.isProcessingMove) return;

        const moveData = this.validMoves.find(m => m.to === toSquare);
        if (!moveData) {
            this.updateAIThoughts('Invalid move. Please select a valid square.');
            return;
        }

        this.isProcessingMove = true;

        // Add to pending move chain
        this.pendingMoveChain.push(moveData);

        // Execute move locally for immediate feedback with animation
        const piece = this.gameState.board[fromSquare];
        this.gameState.board[fromSquare] = '_';

        // Track which squares to animate
        const animatedSquares = [fromSquare, toSquare];

        // Handle captures with animation
        const isCapture = moveData.captures && moveData.captures.length > 0;
        if (isCapture) {
            moveData.captures.forEach(capturePos => {
                this.gameState.board[capturePos] = '_';
                animatedSquares.push(capturePos);
            });
        }

        // Check for king promotion
        const toRow = Math.floor(toSquare / 8);
        let finalPiece = piece;
        if (piece === 'R' && toRow === 0) {
            finalPiece = 'r';
        }

        this.gameState.board[toSquare] = finalPiece;

        // Update UI with animations only on affected squares
        this.updateUIFromState(animatedSquares);
        this.clearSelection();

        // ONLY check for additional captures if the current move was a capture
        if (isCapture) {
            const hasMoreCaptures = this.checkForAdditionalCaptures(toSquare);

            if (hasMoreCaptures) {
                // Highlight the piece that can continue capturing
                this.updateAIThoughts('You can capture another piece! Click on the highlighted piece to continue.');
                this.selectSquare(toSquare);
                this.isProcessingMove = false;
                return;
            }
        }

        // Move is complete, send to server
        await this.sendMoveToServer();
    }

    checkForAdditionalCaptures(fromIndex) {
        const moves = this.calculateValidMovesForPiece(fromIndex);
        const captureMove = moves.find(m => m.captures && m.captures.length > 0);
        return !!captureMove;
    }


    async sendMoveToServer() {
        if (!this.gameSessionId || this.pendingMoveChain.length === 0) {
            this.isProcessingMove = false;
            return;
        }

        this.updateAIThoughts('Analyzing the board...');

        try {
            const response = await fetch(`/api/game/checkers/move`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    gameSessionId: this.gameSessionId,
                    move: this.pendingMoveChain.length === 1 ? this.pendingMoveChain[0] : {
                        chain: this.pendingMoveChain
                    },
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                this.showGameOverOverlay('Error', errorData.message || 'Game state desynchronized. Please start a new game.');
                return;
            }

            const data = await response.json();
            this.pendingMoveChain = [];

            if (data && data.state) {
                // Check if server state matches client state
                if (!this.validateServerState(data.state)) {
                    this.showGameOverOverlay('Desync Error', 'Game state desynchronized with server. Please start a new game.');
                    return;
                }

                // Calculate AI simulation wait time
                const aiSimWaitTime = Math.random() * (this.waitTimeMax - this.waitTimeMin) + this.waitTimeMin;

                // Wait before showing AI's response
                setTimeout(() => {
                    // Collect squares that will be animated for AI move
                    const animatedSquares = [];

                    if (data.aiMove) {
                        if (data.aiMove.chain) {
                            // Multi-move chain
                            data.aiMove.chain.forEach(move => {
                                animatedSquares.push(move.from, move.to);
                                if (move.captures) {
                                    animatedSquares.push(...move.captures);
                                }
                            });
                            this.lastMoveHighlight = data.aiMove.chain.map(m => ({ from: m.from, to: m.to }));
                        } else {
                            // Single move
                            animatedSquares.push(data.aiMove.from, data.aiMove.to);
                            if (data.aiMove.captures) {
                                animatedSquares.push(...data.aiMove.captures);
                            }
                            this.lastMoveHighlight = [{ from: data.aiMove.from, to: data.aiMove.to }];
                        }
                    }

                    // Update game state from server with animations
                    this.gameState = data.state;
                    this.updateUIFromState(animatedSquares);

                    // Handle AI response
                    if (data.gameOver) {
                        const message = data.winner === 'R' ? 'Congratulations! You won!' :
                            data.winner === 'B' ? 'AI wins! Better luck next time.' :
                                "It's a tie!";
                        this.showGameOverOverlay(data.winner === 'R' ? 'Victory!' : 'Game Over', message);
                    } else if (data.aiMove) {
                        this.highlightLastMove();

                        const moveDesc = this.formatAIMove(data.aiMove);
                        this.updateAIThoughts(`${moveDesc} ${this.getGameEndMessage() || 'Your turn!'}`);
                    } else {
                        this.updateAIThoughts('Your turn!');
                    }

                    this.isProcessingMove = false;
                }, aiSimWaitTime);
            }
        } catch (error) {
            console.error('Failed to make move:', error);
            this.showGameOverOverlay('Network Error', 'Failed to connect to server. Please check your connection and start a new game.');
        }
    }

    formatSquare(index) {
        const { row, col } = this.indexToRowCol(index);
        return `${String.fromCharCode(65 + col)}${8 - row}`; // Convert to chess notation (A8, B7, etc.)
    }

    formatAIMove(aiMove) {
        if (aiMove.chain && aiMove.chain.length > 1) {
            const captures = aiMove.chain.reduce((sum, m) => sum + (m.captures?.length || 0), 0);
            return `I captured ${captures} pieces in a combo move!`;
        } else {
            const move = aiMove.chain ? aiMove.chain[0] : aiMove;
            const captured = move.captures && move.captures.length > 0;
            return `I moved from ${this.formatSquare(move.from)} to ${this.formatSquare(move.to)}${captured ? ' and captured your piece!' : '.'}`;
        }
    }

    validateServerState(serverState) {
        // Basic validation - check if server state is reasonable
        if (!serverState || !serverState.board) return false;
        if (serverState.board.length !== 64) return false;

        // Count pieces to ensure state is reasonable
        const redCount = serverState.board.filter(p => p === 'R' || p === 'r').length;
        const blackCount = serverState.board.filter(p => p === 'B' || p === 'b').length;

        // Sanity check - each side should have between 0-12 pieces
        if (redCount < 0 || redCount > 12 || blackCount < 0 || blackCount > 12) return false;

        return true;
    }

    highlightLastMove() {
        // Clear previous highlights
        document.querySelectorAll('.last-move-from, .last-move-to').forEach(el => {
            el.classList.remove('last-move-from', 'last-move-to');
        });

        // Add new highlights
        this.lastMoveHighlight.forEach((move, index) => {
            const fromSquare = document.querySelector(`[data-index="${move.from}"]`);
            const toSquare = document.querySelector(`[data-index="${move.to}"]`);

            if (fromSquare) {
                fromSquare.classList.add('last-move-from');
            }
            if (toSquare) {
                toSquare.classList.add('last-move-to');
            }
        });
    }

    showGameOverOverlay(title, message) {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50';
        overlay.id = 'game-over-overlay';

        overlay.innerHTML = `
            <div class="card bg-base-100 shadow-2xl max-w-md">
                <div class="card-body text-center">
                    <h2 class="card-title text-3xl justify-center mb-4">${title}</h2>
                    <p class="text-lg mb-6">${message}</p>
                    <div class="card-actions justify-center">
                        <button onclick="restartGame()" class="btn btn-primary btn-lg">Start New Game</button>
                        <button onclick="window.location.href='/games'" class="btn btn-ghost btn-lg">Back to Games</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.gameState.gameOver = true;
    }


    updateUIFromState(animatedSquares = []) {
        if (!this.gameState) return;

        for (let i = 0; i < 64; i++) {
            const piece = this.gameState.board[i];
            const shouldAnimate = animatedSquares.includes(i);
            this.updateSquare(i, piece, shouldAnimate);
        }

        // Clear non-playable squares
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if ((row % 2 === 0 && col % 2 === 0) || (row % 2 === 1 && col % 2 === 1)) {
                    const index = row * 8 + col;
                    this.updateSquare(index, '_', false);
                }
            }
        }

        this.updateGameStatus();
        this.updateMoveInfo();

        const mustCaptureEl = document.getElementById('must-capture');
        if (mustCaptureEl) {
            if (this.gameState.mustCapture !== null && this.gameState.currentPlayer === 'R') {
                mustCaptureEl.classList.remove('hidden');
            } else {
                mustCaptureEl.classList.add('hidden');
            }
        }

        if (this.gameState.gameOver && !document.getElementById('game-over-overlay')) {
            const message = this.gameState.winner === 'R' ? 'Congratulations! You won!' :
                this.gameState.winner === 'B' ? 'AI wins! Better luck next time.' :
                    "It's a tie!";
            this.showGameOverOverlay(
                this.gameState.winner === 'R' ? 'Victory!' : 'Game Over',
                message
            );
        }
    }

    updateSquare(index, piece, animate = false) {
        const square = document.querySelector(`[data-index="${index}"]`);
        if (!square) return;

        // Get existing piece info before clearing
        const existingPiece = square.querySelector('.piece-element');
        const hadPiece = !!existingPiece;
        const wasKing = existingPiece && existingPiece.textContent === '♔';

        square.classList.remove('last-move-from', 'last-move-to');

        if (piece !== '_') {
            const pieceElement = document.createElement('div');
            pieceElement.className =
                'piece-element w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-white';

            switch (piece) {
                case 'R': // Red piece
                    pieceElement.classList.add('bg-red-600', 'border-red-800');
                    break;
                case 'r': // Red king
                    pieceElement.classList.add('bg-red-600', 'border-red-800');
                    pieceElement.textContent = '♔';
                    break;
                case 'B': // Black piece
                    pieceElement.classList.add('bg-gray-800', 'border-gray-900');
                    break;
                case 'b': // Black king
                    pieceElement.classList.add('bg-gray-800', 'border-gray-900');
                    pieceElement.textContent = '♔';
                    break;
            }

            // Only add animations if animate is true
            if (animate) {
                // Check if this was just promoted to king
                const isNewKing = (piece === 'r' || piece === 'b') && hadPiece && !wasKing;

                if (isNewKing) {
                    pieceElement.classList.add('piece-king-promotion');
                } else if (hadPiece) {
                    // Piece was replaced (capture)
                    existingPiece.classList.add('piece-capture');
                    setTimeout(() => {
                        square.innerHTML = '';
                        pieceElement.classList.add('piece-move');
                        square.appendChild(pieceElement);
                    }, 400);
                    return; // Exit early since we're handling this async
                } else {
                    // New piece arriving
                    pieceElement.classList.add('piece-move');
                }
            }

            square.innerHTML = '';
            square.appendChild(pieceElement);
        } else {
            // Empty square
            if (animate && existingPiece) {
                // Animate piece being captured or moved away
                existingPiece.classList.add('piece-capture');
                setTimeout(() => {
                    square.innerHTML = '';
                }, 400);
            } else {
                square.innerHTML = '';
            }
        }
    }

    hasAnyCapturesAvailable() {
        if (!this.gameState) return false;

        const board = this.gameState.board;

        // Check all player pieces for available captures
        for (let i = 0; i < 64; i++) {
            const piece = board[i];
            if (piece === 'R' || piece === 'r') {
                // Calculate captures directly without calling calculateValidMovesForPiece
                const captures = this.calculateCapturesForPiece(i);
                if (captures.length > 0) {
                    return true;
                }
            }
        }

        return false;
    }

    calculateCapturesForPiece(fromIndex) {
        if (!this.gameState) return [];

        const captures = [];
        const piece = this.gameState.board[fromIndex];
        const fromRow = Math.floor(fromIndex / 8);
        const fromCol = fromIndex % 8;

        if (piece === '_' || (piece !== 'R' && piece !== 'r')) return [];

        // Determine valid directions based on piece type
        let directions = [];
        if (piece === 'R') {
            directions = [[-1, -1], [-1, 1]];
        } else if (piece === 'r') {
            directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        }

        // Check for captures
        for (const [dr, dc] of directions) {
            const midRow = fromRow + dr;
            const midCol = fromCol + dc;
            const jumpRow = fromRow + dr * 2;
            const jumpCol = fromCol + dc * 2;

            if (jumpRow >= 0 && jumpRow < 8 && jumpCol >= 0 && jumpCol < 8) {
                const midIndex = midRow * 8 + midCol;
                const jumpIndex = jumpRow * 8 + jumpCol;
                const midPiece = this.gameState.board[midIndex];
                const jumpSquare = this.gameState.board[jumpIndex];

                // Check if it's a valid capture
                if ((midPiece === 'B' || midPiece === 'b') && jumpSquare === '_') {
                    captures.push({
                        from: fromIndex,
                        to: jumpIndex,
                        captures: [midIndex]
                    });
                }
            }
        }

        return captures;
    }

    updateGameStatus() {
        const statusElement = document.getElementById('game-status');

        if (!this.gameState) {
            statusElement.textContent = 'Loading...';
            statusElement.className = 'text-2xl font-bold text-info mb-2';
            return;
        }

        if (this.gameState.gameOver) {
            if (this.gameState.winner === 'R') {
                statusElement.textContent = '🎉 You Win!';
                statusElement.className = 'text-2xl font-bold text-success mb-2';
            } else if (this.gameState.winner === 'B') {
                statusElement.textContent = '🤖 AI Wins!';
                statusElement.className = 'text-2xl font-bold text-error mb-2';
            } else {
                statusElement.textContent = "🤝 It's a Tie!";
                statusElement.className = 'text-2xl font-bold text-warning mb-2';
            }
        } else {
            if (this.gameState.currentPlayer === 'R') {
                statusElement.textContent = '🔴 Your Turn';
                statusElement.className = 'text-2xl font-bold text-primary mb-2';
            } else {
                statusElement.textContent = '⚫ AI Thinking...';
                statusElement.className = 'text-2xl font-bold text-secondary mb-2';
            }
        }
    }

    updateMoveInfo() {
        const moveInfoElement = document.getElementById('move-info');
        if (!this.gameState) return;

        const redPieces = this.gameState.board.filter(p => p === 'R' || p === 'r').length;
        const blackPieces = this.gameState.board.filter(p => p === 'B' || p === 'b').length;

        moveInfoElement.textContent = `Move ${this.gameState.moveCount} • Red: ${redPieces} • Black: ${blackPieces}`;
    }

    updateAIThoughts(thought) {
        const thoughtsElement = document.getElementById('ai-thoughts');
        if (thoughtsElement) {
            thoughtsElement.textContent = thought;
        }
    }

    getGameEndMessage() {
        if (!this.gameState || !this.gameState.gameOver) return null;

        if (this.gameState.winner === 'R') {
            return 'Excellent strategy! You outmaneuvered me. Ready for another game?';
        } else if (this.gameState.winner === 'B') {
            return 'I won this time! Your tactical skills are improving though.';
        } else {
            return "A rare tie in checkers! We're evenly matched.";
        }
    }

    async restartGame() {
        // Remove overlay if it exists
        const overlay = document.getElementById('game-over-overlay');
        if (overlay) {
            overlay.remove();
        }

        this.gameSessionId = null;
        this.gameState = null;
        this.isProcessingMove = false;
        this.selectedSquare = null;
        this.validMoves = [];
        this.pendingMoveChain = [];
        this.lastMoveHighlight = [];
        this.clearSelection();

        await this.initializeGame();
    }

}

// Initialize game when page loads
let game;
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
});

// Global functions for buttons
function restartGame() {
    if (game) {
        game.restartGame();
    }
}
