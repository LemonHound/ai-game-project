class CheckersGame {
  constructor() {
    this.gameSessionId = null;
    this.gameState = null;
    this.gameName = 'checkers';
    this.isProcessingMove = false;
    this.selectedSquare = null;
    this.validMoves = [];

    this.initializeGame();
  }

  async initializeGame() {
    this.initializeBoard();
    this.updateGameStatus('Starting new checkers game...');
    this.updateAIThoughts('Checking authentication...');

    const authReady = await window.GameAuthUtils.waitForAuthManager();

    if (!authReady) {
      this.updateAIThoughts(
        'Authentication system failed to load. Please refresh the page.'
      );
      return;
    }

    if (!window.authManager.isAuthenticatedForGames()) {
      this.updateAIThoughts(
        'I can only play with authenticated users - please log in first!'
      );
      return;
    }

    this.updateAIThoughts('Setting up the checkers board...');
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

      // Update UI based on backend state
      this.updateUIFromState();

      if (!this.gameState.playerStarts) {
        this.updateAIThoughts("I'll start this game!");
        await this.makeAIMove();
      } else {
        this.updateAIThoughts(
          'Ready for checkers! Click a red piece to select it, then click where you want to move.'
        );
      }
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
    boardElement.className =
      'grid grid-cols-8 gap-0 border-4 border-amber-800 mx-auto';
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
    const isAuthenticated = await window.GameAuthUtils.isAuthenticated();
    if (!isAuthenticated) {
      this.updateAIThoughts(
        'I can only play with authenticated users - please log in to continue!'
      );
      window.GameAuthUtils.showLoginRequiredModal();
      return;
    }

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
    square.classList.add('ring-4', 'ring-blue-400', 'ring-inset');

    this.highlightValidMoves(index);

    const piece = this.gameState.board[index];
    const pieceType = piece === 'R' ? 'piece' : 'king';
    this.updateAIThoughts(
      `Selected your ${pieceType}. Click on a highlighted square to move.`
    );
  }

  clearSelection() {
    if (this.selectedSquare !== null) {
      const index = this.selectedSquare.index;
      const prevSquare = document.querySelector(`[data-index="${index}"]`);
      if (prevSquare) {
        prevSquare.classList.remove('ring-4', 'ring-blue-400', 'ring-inset');
      }
    }

    // Clear move highlights
    document.querySelectorAll('.move-highlight').forEach((el) => {
      el.classList.remove('bg-green-400', 'move-highlight');
    });

    this.selectedSquare = null;
    this.validMoves = [];
  }

  highlightValidMoves(fromIndex) {
    this.validMoves = this.calculateValidMovesForPiece(fromIndex);

    this.validMoves.forEach((move) => {
      const square = document.querySelector(`[data-index="${move.to}"]`);
      if (square) {
        square.classList.add('bg-green-400', 'move-highlight');
      }
    });
  }

  calculateValidMovesForPiece(fromIndex) {
    // Simplified move calculation for frontend highlighting
    const moves = [];
    const piece = this.gameState.board[fromIndex];
    const fromPos = this.indexToRowCol(fromIndex);

    // Basic diagonal moves
    const directions = [
      { row: -1, col: -1 },
      { row: -1, col: 1 },
      { row: 1, col: -1 },
      { row: 1, col: 1 },
    ];

    const isKing = piece === 'r';

    for (const dir of directions) {
      // Regular pieces can only move forward
      if (!isKing && piece === 'R' && dir.row > 0) continue;

      // Single move
      const newRow = fromPos.row + dir.row;
      const newCol = fromPos.col + dir.col;

      if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
        const newIndex = this.rowColToIndex(newRow, newCol);
        if (newIndex !== -1 && this.gameState.board[newIndex] === '_') {
          moves.push({ from: fromIndex, to: newIndex, captures: [] });
        }
      }

      // Check for captures (jump moves)
      const captureRow = fromPos.row + dir.row;
      const captureCol = fromPos.col + dir.col;
      const landRow = fromPos.row + dir.row * 2;
      const landCol = fromPos.col + dir.col * 2;

      if (landRow >= 0 && landRow < 8 && landCol >= 0 && landCol < 8) {
        const captureIndex = this.rowColToIndex(captureRow, captureCol);
        const landIndex = this.rowColToIndex(landRow, landCol);

        if (captureIndex !== -1 && landIndex !== -1) {
          const capturedPiece = this.gameState.board[captureIndex];

          if (
            (capturedPiece === 'B' || capturedPiece === 'b') &&
            this.gameState.board[landIndex] === '_'
          ) {
            moves.push({
              from: fromIndex,
              to: landIndex,
              captures: [captureIndex],
            });
          }
        }
      }
    }

    return moves;
  }

  async attemptMove(from32, to32) {
    this.isProcessingMove = true;

    try {
      await this.sendMoveToServer(from32, to32);
    } catch (error) {
      console.error('Error making move:', error);
      this.updateAIThoughts('Something went wrong with your move. Try again!');
    } finally {
      this.isProcessingMove = false;
      this.clearSelection();
    }
  }

  async sendMoveToServer(from32, to32) {
    if (!this.gameSessionId) {
      console.warn('No game session ID - cannot make move');
      return;
    }

    // Find the matching valid move to get capture info
    const move = this.validMoves.find(
      (m) => m.from === from32 && m.to === to32
    ) || { from: from32, to: to32, captures: [] };

    const data = await window.GameAuthUtils.handleGameApiCall(async () => {
      return fetch(`/api/${this.gameName}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.gameSessionId,
          move: move,
        }),
      });
    });

    if (data) {
      this.gameState = data.newState;
      this.updateUIFromState();

      // Handle AI response if game is still ongoing
      if (data.aiMove) {
        const aiMove = data.aiMove;
        this.updateAIThoughts(
          `I moved from ${this.formatSquare(aiMove.from)} to ${this.formatSquare(aiMove.to)}${
            aiMove.captures.length > 0 ? ' and captured your piece!' : '.'
          } ${this.getGameEndMessage() || 'Your turn!'}`
        );
      } else if (
        !this.gameState.gameOver &&
        this.gameState.currentPlayer === 'B'
      ) {
        setTimeout(() => this.makeAIMove(), 500);
      } else if (this.gameState.mustCapture !== null) {
        this.updateAIThoughts(
          'You captured a piece! You must continue capturing if possible.'
        );
      }
    }
  }

  formatSquare(index) {
    const { row, col } = this.indexToRowCol(index);
    return `${String.fromCharCode(65 + col)}${8 - row}`; // Convert to chess notation (A8, B7, etc.)
  }

  async makeAIMove() {
    if (this.isProcessingMove || !this.gameState || this.gameState.gameOver) {
      return;
    }

    if (this.gameState.currentPlayer !== 'B') {
      return;
    }

    this.isProcessingMove = true;
    this.updateAIThoughts('Analyzing the board...');

    const data = await window.GameAuthUtils.handleGameApiCall(async () => {
      return fetch(`/api/${this.gameName}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.gameSessionId,
          move: { player: 'B', requestAIMove: true },
        }),
      });
    });

    if (data) {
      this.gameState = data.newState;
      this.updateUIFromState();

      if (data.aiMove) {
        const aiMove = data.aiMove;
        this.updateAIThoughts(
          `I moved from ${this.formatSquare(aiMove.from)} to ${this.formatSquare(aiMove.to)}${
            aiMove.captures.length > 0 ? ' and captured your piece!' : '.'
          } ${this.getGameEndMessage() || 'Your turn!'}`
        );
      }
    }

    this.isProcessingMove = false;
  }

  updateUIFromState() {
    if (!this.gameState) return;

    for (let i = 0; i < 64; i++) {
      const piece = this.gameState.board[i];
      this.updateSquare(i, piece);
    }

    // Clear non-playable squares
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (
          (row % 2 === 0 && col % 2 === 0) ||
          (row % 2 === 1 && col % 2 === 1)
        ) {
          // Light squares
          const index = row * 8 + col;
          this.updateSquare(index, '_');
        }
      }
    }

    // Update game status
    this.updateGameStatus();
    this.updateMoveInfo();

    // Show/hide must capture indicator
    const mustCaptureEl = document.getElementById('must-capture');
    if (
      this.gameState.mustCapture !== null &&
      this.gameState.currentPlayer === 'R'
    ) {
      mustCaptureEl.classList.remove('hidden');
    } else {
      mustCaptureEl.classList.add('hidden');
    }

    // Update AI thoughts for game end
    if (this.gameState.gameOver) {
      this.updateAIThoughts(this.getGameEndMessage());
    }
  }

  updateSquare(index, piece) {
    const square = document.querySelector(`[data-index="${index}"]`);
    if (!square) return;

    // Clear existing piece
    square.innerHTML = '';

    if (piece !== '_') {
      const pieceElement = document.createElement('div');
      pieceElement.className =
        'w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-white';

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

      square.appendChild(pieceElement);
    }
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

    const redPieces = this.gameState.board.filter(
      (p) => p === 'R' || p === 'r'
    ).length;
    const blackPieces = this.gameState.board.filter(
      (p) => p === 'B' || p === 'b'
    ).length;

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
    const canRestart =
      await window.GameAuthUtils.checkAuthBeforeAction('restart a game');
    if (!canRestart) {
      return;
    }

    // Reset local state
    this.gameSessionId = null;
    this.gameState = null;
    this.isProcessingMove = false;
    this.selectedSquare = null;
    this.validMoves = [];
    this.clearSelection();

    // Start a new game
    await this.initializeGame();
  }
}

// Initialize game when page loads
let game;
document.addEventListener('DOMContentLoaded', () => {
  game = new CheckersGame();
});

// Global functions for buttons
function restartGame() {
  if (game) {
    game.restartGame();
  }
}
