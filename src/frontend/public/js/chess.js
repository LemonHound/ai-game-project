class ChessGame {
  constructor() {
    this.board = this.createInitialBoard();
    this.currentPlayer = 'white';
    this.gameOver = false;
    this.gameStarted = false; // Track if game has begun
    this.winner = null;
    this.moveHistory = [];
    this.selectedSquare = null;
    this.validMoves = [];
    this.capturedPieces = { white: [], black: [] };
    this.boardFlipped = false;
    this.playerColor = 'white'; // Player's chosen color
    this.enPassantTarget = null; // For en passant capture
    this.castlingRights = {
      white: { kingside: true, queenside: true },
      black: { kingside: true, queenside: true },
    };
    this.kingPositions = { white: [7, 4], black: [0, 4] };

    // import AI - replace with real AI once it's ready
    this.ai = new BasicChessAI(this);
    this.vsAI = true; // Add this flag

    this.initializeBoard();
    this.updateGameStatus();
  }

  createInitialBoard() {
    // Standard chess starting position
    return [
      ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'], // Black pieces
      ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'], // Black pawns
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'], // White pawns
      ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'], // White pieces
    ];
  }

  initializeBoard() {
    // Clear existing boards
    const desktopBoard = document.getElementById('chess-board');
    const mobileBoard = document.getElementById('mobile-chess-board');

    [desktopBoard, mobileBoard].forEach((boardElement) => {
      if (boardElement) {
        boardElement.innerHTML = '';
        this.createChessBoard(boardElement);
      }
    });

    this.renderBoard();
  }

  createChessBoard(boardElement) {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const square = document.createElement('div');
        const isLight = (row + col) % 2 === 0;

        square.className = `chess-square w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 relative ${
          isLight
            ? 'bg-amber-100 hover:bg-amber-200'
            : 'bg-amber-700 hover:bg-amber-800'
        }`;

        square.setAttribute('data-row', row);
        square.setAttribute('data-col', col);
        square.addEventListener('click', () =>
          this.handleSquareClick(row, col)
        );

        boardElement.appendChild(square);
      }
    }
  }

  renderBoard() {
    const boardElements = [
      document.getElementById('chess-board'),
      document.getElementById('mobile-chess-board'),
    ].filter(Boolean);

    boardElements.forEach((boardElement) => {
      const squares = boardElement.children;

      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const displayRow = this.boardFlipped ? 7 - row : row;
          const displayCol = this.boardFlipped ? 7 - col : col;
          const squareIndex = displayRow * 8 + displayCol;
          const square = squares[squareIndex];
          const piece = this.board[row][col];

          // Clear previous styling and content
          square.classList.remove(
            'ring-4',
            'ring-primary',
            'ring-success',
            'ring-warning'
          );
          square.innerHTML = '';

          // Reset base classes with proper square colors
          const isLight = (displayRow + displayCol) % 2 === 0;
          square.className = `chess-square w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 relative ${
            isLight
              ? 'bg-amber-100 hover:bg-amber-200'
              : 'bg-amber-700 hover:bg-amber-800'
          }`;

          // Add piece image if present
          if (piece) {
            const pieceImg = this.createPieceImage(piece);
            square.appendChild(pieceImg);
          }

          // Add highlighting for selected squares and valid moves
          if (
            this.selectedSquare &&
            this.selectedSquare[0] === row &&
            this.selectedSquare[1] === col
          ) {
            square.classList.add('ring-4', 'ring-primary');
          }

          // Highlight valid moves with a subtle overlay
          if (
            this.validMoves.some((move) => move[0] === row && move[1] === col)
          ) {
            const moveIndicator = document.createElement('div');
            moveIndicator.className =
              'absolute inset-0 bg-green-400 bg-opacity-40 rounded-full m-2';
            square.appendChild(moveIndicator);
          }
        }
      }
    });

    // Show/hide color selection overlay
    this.updateColorSelectionOverlay();
  }

  updateColorSelectionOverlay() {
    const overlays = document.querySelectorAll('.color-selection-overlay');
    if (!this.gameStarted) {
      // Show overlay if game hasn't started
      overlays.forEach((overlay) => overlay.classList.remove('hidden'));
    } else {
      // Hide overlay if game has started
      overlays.forEach((overlay) => overlay.classList.add('hidden'));
    }
  }

  createPieceImage(piece) {
    const img = document.createElement('img');
    const color = this.isWhitePiece(piece) ? 'white' : 'black';
    const pieceType = piece.toLowerCase();

    img.src = `/images/${pieceType}_${color}.png`;
    img.alt = `${color} ${pieceType}`;
    img.className = 'w-10 h-10 object-contain pointer-events-none select-none';
    img.draggable = false;

    return img;
  }

  handleSquareClick(row, col) {
    if (this.gameOver) return;

    // Convert display coordinates to board coordinates when flipped
    const actualRow = this.boardFlipped ? 7 - row : row;
    const actualCol = this.boardFlipped ? 7 - col : col;

    // If no square is selected, select this square if it has a piece of the current player
    if (!this.selectedSquare) {
      const piece = this.board[actualRow][actualCol];
      if (
        piece &&
        this.isWhitePiece(piece) === (this.currentPlayer === 'white')
      ) {
        this.selectedSquare = [actualRow, actualCol];
        this.validMoves = this.getValidMoves(actualRow, actualCol);
        this.renderBoard();
      }
      return;
    }

    // If clicking on the same square, deselect
    if (
      this.selectedSquare[0] === actualRow &&
      this.selectedSquare[1] === actualCol
    ) {
      this.selectedSquare = null;
      this.validMoves = [];
      this.renderBoard();
      return;
    }

    // Check if this is a valid move
    const isValidMove = this.validMoves.some(
      (move) => move[0] === actualRow && move[1] === actualCol
    );

    if (isValidMove) {
      // Make the move
      this.makeMove(
        this.selectedSquare[0],
        this.selectedSquare[1],
        actualRow,
        actualCol
      );
    } else {
      // Select new piece if it belongs to current player
      const piece = this.board[actualRow][actualCol];
      if (
        piece &&
        this.isWhitePiece(piece) === (this.currentPlayer === 'white')
      ) {
        this.selectedSquare = [actualRow, actualCol];
        this.validMoves = this.getValidMoves(actualRow, actualCol);
        this.renderBoard();
      } else {
        // Deselect if clicking on invalid square
        this.selectedSquare = null;
        this.validMoves = [];
        this.renderBoard();
      }
    }
  }

  makeMove(fromRow, fromCol, toRow, toCol) {
    const piece = this.board[fromRow][fromCol];
    const capturedPiece = this.board[toRow][toCol];
    const isWhite = this.isWhitePiece(piece);

    // Check for castling
    if (piece.toLowerCase() === 'k' && Math.abs(toCol - fromCol) === 2) {
      this.performCastling(fromRow, fromCol, toRow, toCol);
    } else {
      // Regular move
      this.board[toRow][toCol] = piece;
      this.board[fromRow][fromCol] = null;

      // Update king position
      if (piece.toLowerCase() === 'k') {
        this.kingPositions[this.currentPlayer] = [toRow, toCol];
      }

      // Handle captured pieces
      if (capturedPiece) {
        const capturedColor = this.isWhitePiece(capturedPiece)
          ? 'white'
          : 'black';
        const capturingColor = capturedColor === 'white' ? 'black' : 'white';
        this.capturedPieces[capturingColor].push(capturedPiece);
      }

      // Update castling rights
      this.updateCastlingRights(piece, fromRow, fromCol);
    }

    // Add move to history
    this.addMoveToHistory(piece, fromRow, fromCol, toRow, toCol, capturedPiece);

    // Clear selection
    this.selectedSquare = null;
    this.validMoves = [];

    // Switch turns
    this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';

    // Update display
    this.renderBoard();
    this.updateGameStatus();
    this.updateCapturedPieces();

    // Check for game end
    if (this.isCheckmate(this.currentPlayer)) {
      this.endGame(this.currentPlayer === 'white' ? 'black' : 'white');
    } else if (this.isStalemate(this.currentPlayer)) {
      this.endGame('draw');
    }

    // AI move if vs AI and it's AI's turn
    if (
      this.vsAI &&
      this.currentPlayer !== this.playerColor &&
      !this.gameOver
    ) {
      this.ai.makeMove(this.currentPlayer);
    }
  }

  performCastling(fromRow, fromCol, toRow, toCol) {
    const king = this.board[fromRow][fromCol];
    const isKingside = toCol > fromCol;
    const rookFromCol = isKingside ? 7 : 0;
    const rookToCol = isKingside ? toCol - 1 : toCol + 1;

    // Move king
    this.board[toRow][toCol] = king;
    this.board[fromRow][fromCol] = null;

    // Move rook
    const rook = this.board[fromRow][rookFromCol];
    this.board[fromRow][rookToCol] = rook;
    this.board[fromRow][rookFromCol] = null;

    // Update king position
    this.kingPositions[this.currentPlayer] = [toRow, toCol];

    // Update castling rights
    this.castlingRights[this.currentPlayer].kingside = false;
    this.castlingRights[this.currentPlayer].queenside = false;
  }

  updateCastlingRights(piece, fromRow, fromCol) {
    if (piece.toLowerCase() === 'k') {
      this.castlingRights[this.currentPlayer].kingside = false;
      this.castlingRights[this.currentPlayer].queenside = false;
    } else if (piece.toLowerCase() === 'r') {
      if (fromCol === 0) {
        this.castlingRights[this.currentPlayer].queenside = false;
      } else if (fromCol === 7) {
        this.castlingRights[this.currentPlayer].kingside = false;
      }
    }
  }

  getValidMoves(row, col) {
    const piece = this.board[row][col];
    if (
      !piece ||
      this.isWhitePiece(piece) !== (this.currentPlayer === 'white')
    ) {
      return [];
    }

    let moves = [];
    const pieceType = piece.toLowerCase();

    switch (pieceType) {
      case 'p':
        moves = this.getPawnMoves(row, col);
        break;
      case 'r':
        moves = this.getRookMoves(row, col);
        break;
      case 'n':
        moves = this.getKnightMoves(row, col);
        break;
      case 'b':
        moves = this.getBishopMoves(row, col);
        break;
      case 'q':
        moves = this.getQueenMoves(row, col);
        break;
      case 'k':
        moves = this.getKingMoves(row, col);
        break;
    }

    // Filter out moves that would put own king in check
    return moves.filter(
      ([toRow, toCol]) => !this.wouldBeInCheck(row, col, toRow, toCol)
    );
  }

  getPawnMoves(row, col) {
    const piece = this.board[row][col];
    const isWhite = this.isWhitePiece(piece);
    const direction = isWhite ? -1 : 1;
    const startRow = isWhite ? 6 : 1;
    const moves = [];

    // Forward moves
    if (
      this.isValidSquare(row + direction, col) &&
      !this.board[row + direction][col]
    ) {
      moves.push([row + direction, col]);

      // Double move from starting position
      if (row === startRow && !this.board[row + 2 * direction][col]) {
        moves.push([row + 2 * direction, col]);
      }
    }

    // Diagonal captures
    for (const dcol of [-1, 1]) {
      const newRow = row + direction;
      const newCol = col + dcol;
      if (this.isValidSquare(newRow, newCol)) {
        const target = this.board[newRow][newCol];
        if (target && this.isWhitePiece(target) !== isWhite) {
          moves.push([newRow, newCol]);
        }
      }
    }

    return moves;
  }

  getRookMoves(row, col) {
    return this.getLinearMoves(row, col, [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]);
  }

  getBishopMoves(row, col) {
    return this.getLinearMoves(row, col, [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]);
  }

  getQueenMoves(row, col) {
    return this.getLinearMoves(row, col, [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]);
  }

  getLinearMoves(row, col, directions) {
    const piece = this.board[row][col];
    const isWhite = this.isWhitePiece(piece);
    const moves = [];

    for (const [drow, dcol] of directions) {
      for (let i = 1; i < 8; i++) {
        const newRow = row + drow * i;
        const newCol = col + dcol * i;

        if (!this.isValidSquare(newRow, newCol)) break;

        const target = this.board[newRow][newCol];
        if (!target) {
          moves.push([newRow, newCol]);
        } else {
          if (this.isWhitePiece(target) !== isWhite) {
            moves.push([newRow, newCol]); // Capture
          }
          break; // Can't move past any piece
        }
      }
    }

    return moves;
  }

  getKnightMoves(row, col) {
    const piece = this.board[row][col];
    const isWhite = this.isWhitePiece(piece);
    const moves = [];
    const knightMoves = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];

    for (const [drow, dcol] of knightMoves) {
      const newRow = row + drow;
      const newCol = col + dcol;

      if (this.isValidSquare(newRow, newCol)) {
        const target = this.board[newRow][newCol];
        if (!target || this.isWhitePiece(target) !== isWhite) {
          moves.push([newRow, newCol]);
        }
      }
    }

    return moves;
  }

  getKingMoves(row, col) {
    const piece = this.board[row][col];
    const isWhite = this.isWhitePiece(piece);
    const moves = [];
    const kingMoves = [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ];

    for (const [drow, dcol] of kingMoves) {
      const newRow = row + drow;
      const newCol = col + dcol;

      if (this.isValidSquare(newRow, newCol)) {
        const target = this.board[newRow][newCol];
        if (!target || this.isWhitePiece(target) !== isWhite) {
          moves.push([newRow, newCol]);
        }
      }
    }

    // Add castling moves
    const color = this.currentPlayer;
    if (this.canCastle(color, true)) {
      // Kingside
      moves.push([row, col + 2]);
    }
    if (this.canCastle(color, false)) {
      // Queenside
      moves.push([row, col - 2]);
    }

    return moves;
  }

  canCastle(color, kingside) {
    const rights = this.castlingRights[color];
    if (
      this.isInCheck(color) ||
      !(kingside ? rights.kingside : rights.queenside)
    )
      return false;

    const [kingRow, kingCol] = this.kingPositions[color];
    const rookCol = kingside ? 7 : 0;
    const direction = kingside ? 1 : -1;

    // Check if path is clear
    for (let col = kingCol + direction; col !== rookCol; col += direction) {
      if (this.board[kingRow][col]) return false;
    }

    // Check if king is in check or would pass through check
    for (let i = 0; i <= 2; i++) {
      if (this.isSquareAttacked(kingRow, kingCol + i * direction, color)) {
        return false;
      }
    }

    return true;
  }

  isValidSquare(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }

  isWhitePiece(piece) {
    return piece === piece.toUpperCase();
  }

  wouldBeInCheck(fromRow, fromCol, toRow, toCol) {
    // Simulate the move
    const originalPiece = this.board[toRow][toCol];
    const movingPiece = this.board[fromRow][fromCol];

    this.board[toRow][toCol] = movingPiece;
    this.board[fromRow][fromCol] = null;

    // Update king position if moving king
    let originalKingPos = null;
    if (movingPiece.toLowerCase() === 'k') {
      originalKingPos = [...this.kingPositions[this.currentPlayer]];
      this.kingPositions[this.currentPlayer] = [toRow, toCol];
    }

    const inCheck = this.isInCheck(this.currentPlayer);

    // Restore the board
    this.board[fromRow][fromCol] = movingPiece;
    this.board[toRow][toCol] = originalPiece;

    if (originalKingPos) {
      this.kingPositions[this.currentPlayer] = originalKingPos;
    }

    return inCheck;
  }

  isInCheck(color) {
    let kingRow, kingCol;
    if (color === 'white') {
      [kingRow, kingCol] = this.kingPositions.white;
    } else {
      [kingRow, kingCol] = this.kingPositions.black;
    }
    return this.isSquareAttacked(kingRow, kingCol, color);
  }

  isSquareAttacked(row, col, defendingColor) {
    const attackingColor = defendingColor === 'white' ? 'black' : 'white';

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (
          piece &&
          this.isWhitePiece(piece) === (attackingColor === 'white')
        ) {
          const moves = this.getValidMovesForAttack(r, c);
          if (moves.some((move) => move[0] === row && move[1] === col)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  getValidMovesForAttack(row, col) {
    // Similar to getValidMoves but without the check filtering (to avoid infinite recursion)
    const piece = this.board[row][col];
    if (!piece) return [];

    const pieceType = piece.toLowerCase();
    switch (pieceType) {
      case 'p':
        return this.getPawnAttacks(row, col);
      case 'r':
        return this.getRookMoves(row, col);
      case 'n':
        return this.getKnightMoves(row, col);
      case 'b':
        return this.getBishopMoves(row, col);
      case 'q':
        return this.getQueenMoves(row, col);
      case 'k':
        return this.getKingAttacks(row, col);
      default:
        return [];
    }
  }

  getPawnAttacks(row, col) {
    const piece = this.board[row][col];
    const isWhite = this.isWhitePiece(piece);
    const direction = isWhite ? -1 : 1;
    const attacks = [];

    for (const dcol of [-1, 1]) {
      const newRow = row + direction;
      const newCol = col + dcol;
      if (this.isValidSquare(newRow, newCol)) {
        attacks.push([newRow, newCol]);
      }
    }

    return attacks;
  }

  getKingAttacks(row, col) {
    const attacks = [];
    const kingMoves = [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ];

    for (const [drow, dcol] of kingMoves) {
      const newRow = row + drow;
      const newCol = col + dcol;
      if (this.isValidSquare(newRow, newCol)) {
        attacks.push([newRow, newCol]);
      }
    }

    return attacks;
  }

  isCheckmate(color) {
    if (!this.isInCheck(color)) return false;
    return !this.hasValidMoves(color);
  }

  isStalemate(color) {
    if (this.isInCheck(color)) return false;
    return !this.hasValidMoves(color);
  }

  hasValidMoves(color) {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board[row][col];
        if (piece && this.isWhitePiece(piece) === (color === 'white')) {
          const moves = this.getValidMoves(row, col);
          if (moves.length > 0) return true;
        }
      }
    }
    return false;
  }

  flipBoard() {
    this.boardFlipped = !this.boardFlipped;
    this.renderBoard();
  }

  setPlayerColor(isWhite) {
    this.playerColor = isWhite ? 'white' : 'black';
    this.boardFlipped = !isWhite;
    this.gameStarted = true; // Mark game as started
    this.renderBoard();
    this.updateGameStatus();

    // If player chose black, AI makes first move
    if (!isWhite && this.vsAI) {
      this.ai.makeMove('white');
    }
  }

  resetGame() {
    // Reset all game state
    this.board = this.createInitialBoard();
    this.currentPlayer = 'white';
    this.gameOver = false;
    this.gameStarted = false;
    this.winner = null;
    this.moveHistory = [];
    this.selectedSquare = null;
    this.validMoves = [];
    this.capturedPieces = { white: [], black: [] };
    this.boardFlipped = false;
    this.playerColor = 'white';
    this.enPassantTarget = null;
    this.castlingRights = {
      white: { kingside: true, queenside: true },
      black: { kingside: true, queenside: true },
    };
    this.kingPositions = { white: [7, 4], black: [0, 4] };

    // Clear move history display
    const historyElement = document.getElementById('move-history');
    if (historyElement) {
      historyElement.innerHTML = '';
    }

    // Re-render everything
    this.renderBoard();
    this.updateGameStatus();
    this.updateCapturedPieces();
  }

  addMoveToHistory(piece, fromRow, fromCol, toRow, toCol, captured) {
    const moveNotation = this.getMoveNotation(
      piece,
      fromRow,
      fromCol,
      toRow,
      toCol,
      captured
    );
    this.moveHistory.push({
      notation: moveNotation,
      piece: piece,
      from: [fromRow, fromCol],
      to: [toRow, toCol],
      captured: captured,
      player: this.currentPlayer,
    });

    const historyElement = document.getElementById('move-history');
    if (historyElement) {
      const moveElement = document.createElement('div');
      moveElement.className = 'text-sm py-1';
      moveElement.textContent = `${this.moveHistory.length}. ${moveNotation}`;
      historyElement.appendChild(moveElement);
      historyElement.scrollTop = historyElement.scrollHeight;
    }
  }

  getMoveNotation(piece, fromRow, fromCol, toRow, toCol, captured) {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const fromSquare = files[fromCol] + (8 - fromRow);
    const toSquare = files[toCol] + (8 - toRow);

    const pieceSymbol = piece.toUpperCase() === 'P' ? '' : piece.toUpperCase();
    const captureSymbol = captured ? 'x' : '';

    return `${pieceSymbol}${captureSymbol}${toSquare}`;
  }

  updateCapturedPieces() {
    const whiteContainers = document.querySelectorAll(
      '#captured-by-white, #mobile-captured-by-white'
    );
    const blackContainers = document.querySelectorAll(
      '#captured-by-black, #mobile-captured-by-black'
    );

    whiteContainers.forEach((container) => {
      if (container) {
        container.innerHTML = this.capturedPieces.white
          .map((piece) => {
            const color = this.isWhitePiece(piece) ? 'white' : 'black';
            const pieceType = piece.toLowerCase();
            return `<img src="/images/${pieceType}_${color}.png" alt="${color} ${pieceType}" class="w-6 h-6 object-contain">`;
          })
          .join('');
      }
    });

    blackContainers.forEach((container) => {
      if (container) {
        container.innerHTML = this.capturedPieces.black
          .map((piece) => {
            const color = this.isWhitePiece(piece) ? 'white' : 'black';
            const pieceType = piece.toLowerCase();
            return `<img src="/images/${pieceType}_${color}.png" alt="${color} ${pieceType}" class="w-6 h-6 object-contain">`;
          })
          .join('');
      }
    });
  }

  endGame(winner) {
    this.gameOver = true;
    this.winner = winner;

    let statusMessage = '';
    if (winner === 'draw') {
      statusMessage = '🤝 Draw! Good game!';
    } else {
      const winnerName = winner.charAt(0).toUpperCase() + winner.slice(1);
      statusMessage = `🏆 ${winnerName} wins!`;
    }

    const statusElements = document.querySelectorAll(
      '#game-status, #mobile-game-status'
    );
    statusElements.forEach((element) => {
      if (element) element.textContent = statusMessage;
    });
  }

  updateGameStatus() {
    const statusElements = document.querySelectorAll(
      '#mobile-chess-game-status, #chess-game-status'
    );
    const turnElements = document.querySelectorAll(
      '#current-player-text, #mobile-current-player-text'
    );

    statusElements.forEach((element) => {
      if (element) {
        if (!this.gameStarted) {
          element.textContent = ''; // Empty when not started
        } else if (this.gameOver) {
          if (this.winner === 'draw') {
            element.textContent = '🤝 Draw! Good game!';
          } else {
            const winnerName =
              this.winner.charAt(0).toUpperCase() + this.winner.slice(1);
            element.textContent = `🏆 ${winnerName} wins!`;
          }
        } else if (this.isInCheck(this.currentPlayer)) {
          const playerName =
            this.currentPlayer.charAt(0).toUpperCase() +
            this.currentPlayer.slice(1);
          element.textContent = `⚠️ ${playerName} is in check!`;
        } else {
          element.textContent = ''; // Empty during normal play
        }
      }
    });

    turnElements.forEach((element) => {
      if (element) {
        if (this.gameStarted && !this.gameOver) {
          const playerName =
            this.currentPlayer.charAt(0).toUpperCase() +
            this.currentPlayer.slice(1);
          element.textContent = `${playerName}'s Turn`;
        } else {
          element.textContent = '';
        }
      }
    });
  }
}

// Initialize the game when the page loads
let chessGame;

function startGame(isWhite) {
  if (!chessGame) {
    chessGame = new ChessGame();
  }
  chessGame.setPlayerColor(isWhite);

  // Update status
  const statusElements = document.querySelectorAll(
    '#game-status, #mobile-game-status'
  );
  statusElements.forEach((element) => {
    if (element) {
      element.textContent = `Playing as ${isWhite ? 'White' : 'Black'}`;
    }
  });
}

// Initialize game on page load
document.addEventListener('DOMContentLoaded', function () {
  chessGame = new ChessGame();
});
