const GameEngineInterface = require('./game-engine-interface');
const pool = require('../../shared/database/connection');

class CheckersEngine extends GameEngineInterface {
    constructor() {
        super();
        this.engine_id = 'checkers';

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

    indexToRowCol(index) {
        const row = Math.floor(index / 8);
        const col = Math.floor(index % 8);
        return { row, col };
    }

    rowColToIndex(row, col) {
        if (!this.isPlayableSquare(row, col)) return -1;
        return row * 8 + col;
    }

    isPlayableSquare(row, col) {
        return (row + col) % 2 === 1;
    }

    initializeGame(options = {}) {
        const playerStarts = options.playerStarts !== false; // Default true (red goes first)
        const difficulty = options.difficulty || 'medium';

        const initialBoard = this.createInitialBoard();

        return {
            gameId: this.engine_id,
            board: initialBoard,
            currentPlayer: playerStarts ? 'R' : 'B', // R = Red (player), B = Black (AI)
            gameOver: false,
            winner: null,
            moveHistory: [],
            playerStarts,
            difficulty,
            moveCount: 0,
            mustCapture: null,
            createdAt: new Date().toISOString(),
        };
    }

    createInitialBoard() {
        const board = Array(64).fill(this.EMPTY);

        for (let i = 0; i < board.length; i++) {
            const row = Math.floor(i / 8);
            const col = i % 8;
            if (row % 2 === 0) {
                if (col % 2 === 1) {
                    if (row < 3) {
                        board[i] = this.BLACK_PIECE;
                    }
                    if (row >= 5) {
                        board[i] = this.RED_PIECE;
                    }
                }
            } else {
                if (col % 2 === 0) {
                    if (row < 3) {
                        board[i] = this.BLACK_PIECE;
                    }
                    if (row >= 5) {
                        board[i] = this.RED_PIECE;
                    }
                }
            }
        }

        return board;
    }

    isValidMove(gameState, move) {
        if (move.requestAIMove) {
            console.log('skipping isValidMove - AI move requested');
            return true;
        }
        if (!move) {
            console.error('Invalid move format:', move);
            return false;
        }

        const { from, to } = move;

        if (gameState.gameOver) {
            return false;
        }

        if (move.requestAIMove === false) {
            if (from < 0 || from >= 64 || to < 0 || to >= 64) {
                console.log('move was outside of the board dimensions');
                return false;
            }
        }

        const piece = gameState.board[from];
        const targetSquare = gameState.board[to];

        if (!piece || piece === this.EMPTY) {
            return false;
        }

        if (gameState.currentPlayer === 'R' && !piece.includes('R') && !piece.includes('r')) {
            console.log('red attempted to move a black piece');
            return false;
        }
        if (gameState.currentPlayer === 'B' && !piece.includes('B') && !piece.includes('b')) {
            console.log('black attempted to move a red piece');
            return false;
        }

        if (targetSquare !== this.EMPTY) {
            console.log('target square is not empty');
            return false;
        }

        if (gameState.mustCapture !== null && gameState.mustCapture !== from) {
            console.log('target must capture?? wtf is this logic');
            return false;
        }

        return this.isValidMovement(gameState, from, to, move.captures || []);
    }

    isValidMovement(gameState, from, to, captures) {
        const fromPos = this.indexToRowCol(from);
        const toPos = this.indexToRowCol(to);
        const piece = gameState.board[from];

        const rowDiff = toPos.row - fromPos.row;
        const colDiff = Math.abs(toPos.col - fromPos.col);

        if (Math.abs(rowDiff) !== colDiff) {
            console.log('not a diagonal move');
            return false;
        }

        const isKing = piece.toLowerCase() !== piece;

        if (!isKing) {
            if (piece === this.RED_PIECE && rowDiff >= 0) {
                console.log('red attempted to move backwards');
                return false;
            }
            if (piece === this.BLACK_PIECE && rowDiff <= 0) {
                console.log('black attempted to move backwards');
                return false;
            }
        }

        if (Math.abs(rowDiff) === 1) {
            console.log('only moved one row. checking for captures.  result:', captures.length);
            return captures.length === 0;
        }

        if (Math.abs(rowDiff) === 2) {
            if (captures.length !== 1) {
                console.log('moved 2 rows but did not capture.');
                return false;
            }

            const captureIndex = captures[0];
            if (captureIndex < 0 || captureIndex >= 64) {
                console.log('moved outside of valid board range');
                return false;
            }

            const capturePos = this.indexToRowCol(captureIndex);

            const expectedCaptureRow = fromPos.row + rowDiff / 2;
            const expectedCaptureCol = fromPos.col + (toPos.col - fromPos.col) / 2;

            if (capturePos.row !== expectedCaptureRow || capturePos.col !== expectedCaptureCol) {
                console.log(
                    'capture position is different than expected. got col',
                    capturePos.col,
                    ' row',
                    capturePos.row,
                    ', expected col',
                    expectedCaptureCol,
                    ' row',
                    expectedCaptureRow
                );
                return false;
            }

            const capturedPiece = gameState.board[captureIndex];

            if (gameState.currentPlayer === 'R' && !capturedPiece.includes('B') && !capturedPiece.includes('b')) {
                console.log('red attempted to capture red');
                return false;
            }
            if (gameState.currentPlayer === 'B' && !capturedPiece.includes('R') && !capturedPiece.includes('r')) {
                console.log('black attempted to capture black');
                return false;
            }
            console.log('this is a valid move, returning true');
            return true;
        }

        console.log('invalid move distance, returning false');
        return false;
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
        captures.forEach(captureIndex => {
            newState.board[captureIndex] = this.EMPTY;
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

    isAIMove(gameState) {
        // TODO: Update this logic when AI can play as Red
        return gameState.currentPlayer === 'B';
    }

    getCaptureMoves(gameState, fromIndex) {
        const captureMoves = [];
        const piece = gameState.board[fromIndex];
        const fromPos = this.indexToRowCol(fromIndex);

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
            if (captureRow < 0 || captureRow >= 8 || captureCol < 0 || captureCol >= 8) continue;
            if (landRow < 0 || landRow >= 8 || landCol < 0 || landCol >= 8) continue;

            // Check if landing square is playable
            if (!this.isPlayableSquare(landRow, landCol)) continue;

            const captureIndex = this.rowColToIndex(captureRow, captureCol);
            const landIndex = this.rowColToIndex(landRow, landCol);

            if (captureIndex === -1 || landIndex === -1) continue;
            if (gameState.board[landIndex] !== this.EMPTY) continue;

            const capturedPiece = gameState.board[captureIndex];

            // Must capture opponent piece
            const isOpponent =
                (gameState.currentPlayer === 'R' && (capturedPiece.includes('B') || capturedPiece.includes('b'))) ||
                (gameState.currentPlayer === 'B' && (capturedPiece.includes('R') || capturedPiece.includes('r')));

            if (isOpponent) {
                captureMoves.push({
                    from: fromIndex,
                    to: landIndex,
                    captures: [captureIndex],
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
        for (let i = 0; i < 64; i++) {
            const piece = gameState.board[i];
            if (player === 'R' && (piece.includes('R') || piece.includes('r'))) {
                pieces.push(i);
            } else if (player === 'B' && (piece.includes('B') || piece.includes('b'))) {
                pieces.push(i);
            }
        }
        return pieces;
    }

    getAllValidMoves(gameState) {
        const moves = [];
        const playerPieces = this.getPiecesForPlayer(gameState, gameState.currentPlayer);

        // If capturing is forced (i.e. chain captures), only consider moves from that position
        if (gameState.mustCapture !== null) {
            return this.getMovesFromPosition(gameState, gameState.mustCapture);
        }

        // Check all pieces for valid moves
        for (const pieceIndex of playerPieces) {
            moves.push(...this.getMovesFromPosition(gameState, pieceIndex));
        }

        // Prioritize capture moves
        const captureMoves = moves.filter(move => move.captures && move.captures.length > 0);
        return captureMoves.length > 0 ? captureMoves : moves;
    }

    getMovesFromPosition(gameState, fromIndex) {
        const moves = [];
        const fromPos = this.indexToRowCol(fromIndex);
        const piece = gameState.board[fromIndex];

        if (!piece || piece === this.EMPTY) return moves;

        // Check capture moves first
        const captureMoves = this.getCaptureMoves(gameState, fromIndex);
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

            const toIndex = this.rowColToIndex(newRow, newCol);
            if (toIndex === -1 || gameState.board[toIndex] !== this.EMPTY) continue;

            moves.push({
                from: fromIndex,
                to: toIndex,
                captures: [],
            });
        }

        return moves;
    }

    serializeState(gameState) {
        const boardState = gameState.board.join('');
        const moveSequence = gameState.moveHistory
            .map(
                move =>
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

    async getAIMove(gameState, difficulty = 'medium') {
        if (gameState.currentPlayer !== 'B' || gameState.gameOver) {
            return null;
        }

        const validMoves = this.getAllValidMoves(gameState);
        if (validMoves.length === 0) return null;

        // Simple AI: prefer captures, otherwise random move
        const captureMoves = validMoves.filter(move => move.captures && move.captures.length > 0);

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
            {
                name: 'incomplete_games',
                type: 'count',
                label: 'Incomplete Games',
            },
        ];
    }

    async getStates(limit = 10) {
        try {
            const query = `
                SELECT board_positions,
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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = CheckersEngine;
