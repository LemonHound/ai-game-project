const GameEngineInterface = require('./game-engine-interface');
const pool = require('../../shared/database/connection');

class CheckersEngine extends GameEngineInterface {
  constructor() {
    super();
    this.engine_id = 'checkers';

    // Board constants - we use 32 playable squares (dark squares only)
    this.BOARD_SIZE = 8;
    this.PLAYABLE_SQUARES = 32;

    // Piece types
    this.EMPTY = '_';
    this.RED_PIECE = 'R'; // Player pieces
    this.RED_KING = 'r'; // Player kings
    this.BLACK_PIECE = 'B'; // AI pieces
    this.BLACK_KING = 'b'; // AI kings
  }

  getEngineId() {
    return this.engine_id;
  }

  // Convert 32-square index (0-31) to 8x8 board row/col
  indexToRowCol(index32) {
    const row = Math.floor(index32 / 4);
    const col = (index32 % 4) * 2 + (row % 2);
    return { row, col };
  }

  // Convert 8x8 board row/col to 32-square index
  rowColToIndex(row, col) {
    if (!this.isPlayableSquare(row, col)) return -1;
    return row * 4 + Math.floor(col / 2);
  }

  // Convert 64-square index to 32-square index
  index64To32(index64) {
    const row = Math.floor(index64 / 8);
    const col = index64 % 8;
    return this.rowColToIndex(row, col);
  }

  // Convert 32-square index to 64-square index (for frontend compatibility)
  index32To64(index32) {
    const { row, col } = this.indexToRowCol(index32);
    return row * 8 + col;
  }

  isPlayableSquare(row, col) {
    // Only dark squares are playable in checkers
    return (row + col) % 2 === 1;
  }

  initializeGame(options = {}) {
    const playerStarts = options.playerStarts !== false; // Default true (red goes first)
    const difficulty = options.difficulty || 'medium';

    // Initialize standard checkers starting position using 32 squares
    const initialBoard = this.createInitialBoard();

    return {
      gameId: this.engine_id,
      board: initialBoard, // 32-element array
      currentPlayer: playerStarts ? 'R' : 'B', // R = Red (player), B = Black (AI)
      gameOver: false,
      winner: null,
      moveHistory: [],
      playerStarts,
      difficulty,
      moveCount: 0,
      mustCapture: null, // Stores 32-square index if player must continue capturing
      createdAt: new Date().toISOString(),
    };
  }

  createInitialBoard() {
    // Standard checkers setup using 32 playable squares:
    // Squares 0-11: Black pieces (AI) - top 3 rows
    // Squares 12-19: Empty - middle 2 rows
    // Squares 20-31: Red pieces (Player) - bottom 3 rows
    const board = Array(32).fill(this.EMPTY);

    // Place black pieces (AI) on squares 0-11
    for (let i = 0; i < 12; i++) {
      board[i] = this.BLACK_PIECE;
    }

    // Place red pieces (player) on squares 20-31
    for (let i = 20; i < 32; i++) {
      board[i] = this.RED_PIECE;
    }

    return board;
  }

  isValidMove(gameState, move) {
    // move format: { from: index32, to: index32, captures: [indices32] }
    if (
      !move ||
      typeof move.from === 'undefined' ||
      typeof move.to === 'undefined'
    ) {
      console.error('Invalid move format:', move);
      return false;
    }

    const { from, to } = move;

    if (gameState.gameOver) return false;

    // Basic bounds checking for 32-square system
    if (from < 0 || from >= 32 || to < 0 || to >= 32) return false;

    const piece = gameState.board[from];
    const targetSquare = gameState.board[to];

    // Must have a piece to move
    if (!piece || piece === this.EMPTY) return false;

    // Must move own piece
    if (
      gameState.currentPlayer === 'R' &&
      !piece.includes('R') &&
      !piece.includes('r')
    )
      return false;
    if (
      gameState.currentPlayer === 'B' &&
      !piece.includes('B') &&
      !piece.includes('b')
    )
      return false;

    // Target square must be empty
    if (targetSquare !== this.EMPTY) return false;

    // If must capture (continuing multi-jump), verify this move continues from correct position
    if (gameState.mustCapture !== null && gameState.mustCapture !== from)
      return false;

    return this.isValidMovement(gameState, from, to, move.captures || []);
  }

  isValidMovement(gameState, from, to, captures) {
    const fromPos = this.indexToRowCol(from);
    const toPos = this.indexToRowCol(to);
    const piece = gameState.board[from];

    const rowDiff = toPos.row - fromPos.row;
    const colDiff = Math.abs(toPos.col - fromPos.col);

    // Must move diagonally
    if (Math.abs(rowDiff) !== colDiff) return false;

    const isKing = piece.toLowerCase() !== piece;

    // Regular pieces can only move forward (except kings)
    if (!isKing) {
      if (piece === this.RED_PIECE && rowDiff >= 0) return false; // Red moves up (negative row direction)
      if (piece === this.BLACK_PIECE && rowDiff <= 0) return false; // Black moves down (positive row direction)
    }

    // Single square move (no capture)
    if (Math.abs(rowDiff) === 1) {
      return captures.length === 0; // No captures for single moves
    }

    // Multi-square move must be capture
    if (Math.abs(rowDiff) === 2) {
      // Must capture exactly one piece
      if (captures.length !== 1) return false;

      const captureIndex32 = captures[0];
      if (captureIndex32 < 0 || captureIndex32 >= 32) return false;

      const capturePos = this.indexToRowCol(captureIndex32);

      // Capture position must be between from and to
      const expectedCaptureRow = fromPos.row + rowDiff / 2;
      const expectedCaptureCol = fromPos.col + (toPos.col - fromPos.col) / 2;

      if (
        capturePos.row !== expectedCaptureRow ||
        capturePos.col !== expectedCaptureCol
      ) {
        return false;
      }

      const capturedPiece = gameState.board[captureIndex32];

      // Must capture opponent piece
      if (
        gameState.currentPlayer === 'R' &&
        !capturedPiece.includes('B') &&
        !capturedPiece.includes('b')
      )
        return false;
      if (
        gameState.currentPlayer === 'B' &&
        !capturedPiece.includes('R') &&
        !capturedPiece.includes('r')
      )
        return false;

      return true;
    }

    return false; // Invalid move distance
  }

  processMove(gameState, move) {
    if (!this.isValidMove(gameState, move)) {
      throw new Error('Invalid move');
    }

    const newState = JSON.parse(JSON.stringify(gameState));
    const { from, to, captures = [] } = move;

    // Move the piece
    newState.board[to] = newState.board[from];
    newState.board[from] = this.EMPTY;

    // Handle captures
    captures.forEach((captureIndex32) => {
      newState.board[captureIndex32] = this.EMPTY;
    });

    // Check for king promotion
    const toPos = this.indexToRowCol(to);
    if (newState.board[to] === this.RED_PIECE && toPos.row === 0) {
      newState.board[to] = this.RED_KING;
    } else if (newState.board[to] === this.BLACK_PIECE && toPos.row === 7) {
      newState.board[to] = this.BLACK_KING;
    }

    newState.moveCount++;

    // Add to move history
    newState.moveHistory.push({
      player: newState.currentPlayer,
      from,
      to,
      captures,
      timestamp: new Date().toISOString(),
      moveNumber: newState.moveCount,
    });

    // Check if player can capture again from new position
    const additionalCaptures = this.getCaptureMoves(newState, to);
    if (captures.length > 0 && additionalCaptures.length > 0) {
      // Must continue capturing
      newState.mustCapture = to;
    } else {
      // End turn
      newState.mustCapture = null;
      newState.currentPlayer = newState.currentPlayer === 'R' ? 'B' : 'R';
    }

    // Check for game end
    const gameEnd = this.checkGameEnd(newState);
    if (gameEnd) {
      newState.gameOver = gameEnd.gameOver;
      newState.winner = gameEnd.winner;
      newState.mustCapture = null;
    }

    return newState;
  }

  getCaptureMoves(gameState, fromIndex32) {
    const captureMoves = [];
    const piece = gameState.board[fromIndex32];
    const fromPos = this.indexToRowCol(fromIndex32);

    // Check all four diagonal directions
    const directions = [
      { row: -1, col: -1 },
      { row: -1, col: 1 },
      { row: 1, col: -1 },
      { row: 1, col: 1 },
    ];

    const isKing = piece.toLowerCase() !== piece;

    for (const dir of directions) {
      // Regular pieces have movement restrictions
      if (!isKing) {
        if (piece === this.RED_PIECE && dir.row >= 0) continue;
        if (piece === this.BLACK_PIECE && dir.row <= 0) continue;
      }

      const captureRow = fromPos.row + dir.row;
      const captureCol = fromPos.col + dir.col;
      const landRow = fromPos.row + dir.row * 2;
      const landCol = fromPos.col + dir.col * 2;

      // Check bounds
      if (
        captureRow < 0 ||
        captureRow >= 8 ||
        captureCol < 0 ||
        captureCol >= 8
      )
        continue;
      if (landRow < 0 || landRow >= 8 || landCol < 0 || landCol >= 8) continue;

      // Check if landing square is playable
      if (!this.isPlayableSquare(landRow, landCol)) continue;

      const captureIndex32 = this.rowColToIndex(captureRow, captureCol);
      const landIndex32 = this.rowColToIndex(landRow, landCol);

      if (captureIndex32 === -1 || landIndex32 === -1) continue;
      if (gameState.board[landIndex32] !== this.EMPTY) continue;

      const capturedPiece = gameState.board[captureIndex32];

      // Must capture opponent piece
      const isOpponent =
        (gameState.currentPlayer === 'R' &&
          (capturedPiece.includes('B') || capturedPiece.includes('b'))) ||
        (gameState.currentPlayer === 'B' &&
          (capturedPiece.includes('R') || capturedPiece.includes('r')));

      if (isOpponent) {
        captureMoves.push({
          from: fromIndex32,
          to: landIndex32,
          captures: [captureIndex32],
        });
      }
    }

    return captureMoves;
  }

  checkGameEnd(gameState) {
    const redPieces = this.getPiecesForPlayer(gameState, 'R');
    const blackPieces = this.getPiecesForPlayer(gameState, 'B');

    // Check if either player has no pieces left
    if (redPieces.length === 0) {
      return { gameOver: true, winner: 'B' };
    }
    if (blackPieces.length === 0) {
      return { gameOver: true, winner: 'R' };
    }

    // Check if current player has no valid moves
    const validMoves = this.getAllValidMoves(gameState);
    if (validMoves.length === 0) {
      return {
        gameOver: true,
        winner: gameState.currentPlayer === 'R' ? 'B' : 'R',
      };
    }

    return null; // Game continues
  }

  getPiecesForPlayer(gameState, player) {
    const pieces = [];
    for (let i = 0; i < 32; i++) {
      const piece = gameState.board[i];
      if (player === 'R' && (piece.includes('R') || piece.includes('r'))) {
        pieces.push(i);
      } else if (
        player === 'B' &&
        (piece.includes('B') || piece.includes('b'))
      ) {
        pieces.push(i);
      }
    }
    return pieces;
  }

  getAllValidMoves(gameState) {
    const moves = [];
    const playerPieces = this.getPiecesForPlayer(
      gameState,
      gameState.currentPlayer
    );

    // If must capture, only consider moves from that position
    if (gameState.mustCapture !== null) {
      return this.getMovesFromPosition(gameState, gameState.mustCapture);
    }

    // Check all pieces for valid moves
    for (const pieceIndex32 of playerPieces) {
      moves.push(...this.getMovesFromPosition(gameState, pieceIndex32));
    }

    // Prioritize capture moves (mandatory in checkers)
    const captureMoves = moves.filter(
      (move) => move.captures && move.captures.length > 0
    );
    return captureMoves.length > 0 ? captureMoves : moves;
  }

  getMovesFromPosition(gameState, fromIndex32) {
    const moves = [];
    const fromPos = this.indexToRowCol(fromIndex32);
    const piece = gameState.board[fromIndex32];

    if (!piece || piece === this.EMPTY) return moves;

    // Check capture moves first
    const captureMoves = this.getCaptureMoves(gameState, fromIndex32);
    moves.push(...captureMoves);

    // If captures are available, they are mandatory
    if (captureMoves.length > 0) return moves;

    // Check regular moves
    const directions = [
      { row: -1, col: -1 },
      { row: -1, col: 1 },
      { row: 1, col: -1 },
      { row: 1, col: 1 },
    ];

    const isKing = piece.toLowerCase() !== piece;

    for (const dir of directions) {
      // Regular pieces have movement restrictions
      if (!isKing) {
        if (piece === this.RED_PIECE && dir.row >= 0) continue;
        if (piece === this.BLACK_PIECE && dir.row <= 0) continue;
      }

      const newRow = fromPos.row + dir.row;
      const newCol = fromPos.col + dir.col;

      if (newRow < 0 || newRow >= 8 || newCol < 0 || newCol >= 8) continue;
      if (!this.isPlayableSquare(newRow, newCol)) continue;

      const toIndex32 = this.rowColToIndex(newRow, newCol);
      if (toIndex32 === -1 || gameState.board[toIndex32] !== this.EMPTY)
        continue;

      moves.push({
        from: fromIndex32,
        to: toIndex32,
        captures: [],
      });
    }

    return moves;
  }

  // Convert 32-square board to 32-character string for database storage
  serializeState(gameState) {
    const boardState = gameState.board.join('');
    const moveSequence = gameState.moveHistory
      .map(
        (move) =>
          `${move.player}:${move.from}-${move.to}${move.captures.length ? `x${move.captures.join(',')}` : ''}`
      )
      .join(',');

    return {
      boardState,
      metadata: {
        moveSequence,
        moveCount: gameState.moveCount,
        difficulty: gameState.difficulty,
        playerStarts: gameState.playerStarts,
      },
    };
  }

  getAIMove(gameState, difficulty = 'medium') {
    if (gameState.currentPlayer !== 'B' || gameState.gameOver) {
      return null;
    }

    const validMoves = this.getAllValidMoves(gameState);
    if (validMoves.length === 0) return null;

    // Simple AI: prefer captures, otherwise random move
    const captureMoves = validMoves.filter(
      (move) => move.captures && move.captures.length > 0
    );

    if (captureMoves.length > 0) {
      // Choose random capture move
      return captureMoves[Math.floor(Math.random() * captureMoves.length)];
    }

    // Choose random valid move
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }

  getStatFields() {
    return [
      { name: 'total_games', type: 'count', label: 'Total Games' },
      { name: 'wins', type: 'count', label: 'Wins' },
      { name: 'losses', type: 'count', label: 'Losses' },
      { name: 'ties', type: 'count', label: 'Ties' },
      { name: 'avg_moves', type: 'average', label: 'Average Moves' },
      { name: 'win_rate', type: 'percentage', label: 'Win Rate' },
      { name: 'incomplete_games', type: 'count', label: 'Incomplete Games' },
    ];
  }

  async getStates(limit = 10) {
    try {
      const query = `
                SELECT
                    board_positions,
                    move_count,
                    count,
                    rating
                FROM checkers_states
                WHERE move_count > 0
                ORDER BY count DESC, move_count DESC
                    LIMIT $1
            `;

      const result = await pool.query(query, [limit]);
      return result.rows;
    } catch (error) {
      console.error('Checkers states error:', error);
      throw error;
    }
  }
}

module.exports = CheckersEngine;
