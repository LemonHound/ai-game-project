class ChessGame {
    constructor() {
        this.board = this.createInitialBoard();
        this.currentPlayer = 'white';
        this.gameOver = false;
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
            black: { kingside: true, queenside: true }
        };
        this.kingPositions = { white: [7, 4], black: [0, 4] };

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
            ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']  // White pieces
        ];
    }

    initializeBoard() {
        const boardElement = document.getElementById('chess-board');
        boardElement.innerHTML = '';

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                const isLight = (row + col) % 2 === 0;

                // Apply DaisyUI classes for chess board colors
                square.className = `chess-square w-12 h-12 flex items-center justify-center text-2xl cursor-pointer transition-all duration-200 ${
                    isLight ? 'bg-primary hover:bg-amber-200' : 'bg-neutral hover:bg-amber-700'
                }`;

                square.setAttribute('data-row', row);
                square.setAttribute('data-col', col);
                square.addEventListener('click', () => this.handleSquareClick(row, col));

                boardElement.appendChild(square);
            }
        }

        this.renderBoard();
    }

    renderBoard() {
        const boardElement = document.getElementById('chess-board');
        const squares = boardElement.children;

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const displayRow = this.boardFlipped ? 7 - row : row;
                const displayCol = this.boardFlipped ? 7 - col : col;
                const squareIndex = displayRow * 8 + displayCol;
                const square = squares[squareIndex];
                const piece = this.board[row][col];

                // Clear previous styling
                square.classList.remove('ring-4', 'ring-primary', 'ring-success', 'ring-warning', 'bg-green-300', 'bg-red-300');

                // Restore original colors
                const isLight = (displayRow + displayCol) % 2 === 0;
                square.className = `chess-square w-12 h-12 flex items-center justify-center text-2xl cursor-pointer transition-all duration-200 ${
                    isLight ? 'bg-amber-100 hover:bg-amber-200' : 'bg-amber-600 hover:bg-amber-700'
                }`;

                // Add piece
                square.textContent = piece ? this.getPieceSymbol(piece) : '';

                // Highlight selected square
                if (this.selectedSquare && this.selectedSquare[0] === row && this.selectedSquare[1] === col) {
                    square.classList.add('ring-4', 'ring-primary');
                }

                // Highlight valid moves
                if (this.validMoves.some(move => move[0] === row && move[1] === col)) {
                    square.classList.add('bg-green-300');
                }
            }
        }
    }

    getPieceSymbol(piece) {
        const symbols = {
            'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
            'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
        };
        return symbols[piece] || '';
    }

    handleSquareClick(row, col) {
        if (this.gameOver) return;

        const piece = this.board[row][col];
        const isPlayerTurn = this.currentPlayer === this.playerColor;

        // If clicking on a valid move
        if (this.selectedSquare && this.validMoves.some(move => move[0] === row && move[1] === col)) {
            this.makeMove(this.selectedSquare[0], this.selectedSquare[1], row, col);
            return;
        }

        // If clicking on own piece
        if (piece && this.isPlayerPiece(piece) && isPlayerTurn) {
            this.selectSquare(row, col);
        } else {
            this.clearSelection();
        }
    }

    selectSquare(row, col) {
        this.selectedSquare = [row, col];
        this.validMoves = this.getValidMoves(row, col);
        this.renderBoard();
    }

    clearSelection() {
        this.selectedSquare = null;
        this.validMoves = [];
        this.renderBoard();
    }

    isPlayerPiece(piece) {
        if (this.currentPlayer === 'white') {
            return piece === piece.toUpperCase();
        } else {
            return piece === piece.toLowerCase();
        }
    }

    makeMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        const capturedPiece = this.board[toRow][toCol];

        // Handle captures
        if (capturedPiece) {
            const capturedBy = this.isWhitePiece(piece) ? 'white' : 'black';
            this.capturedPieces[capturedBy].push(capturedPiece);
            this.updateCapturedPieces();
        }

        // Handle special moves
        this.handleSpecialMoves(piece, fromRow, fromCol, toRow, toCol);

        // Make the move
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;

        // Update king position if king moved
        if (piece.toLowerCase() === 'k') {
            this.kingPositions[this.currentPlayer] = [toRow, toCol];
        }

        // Add to move history
        this.addMoveToHistory(piece, fromRow, fromCol, toRow, toCol, capturedPiece);

        // Clear selection
        this.clearSelection();

        // Check for game end conditions
        if (this.isCheckmate(!this.isWhitePiece(piece))) {
            this.endGame(this.currentPlayer);
        } else if (this.isStalemate(!this.isWhitePiece(piece))) {
            this.endGame('draw');
        } else {
            // Switch turns
            this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
            console.log("current player", this.currentPlayer);
            this.updateGameStatus();
        }
    }

    handleSpecialMoves(piece, fromRow, fromCol, toRow, toCol) {
        // Handle castling
        if (piece.toLowerCase() === 'k' && Math.abs(toCol - fromCol) === 2) {
            const isKingside = toCol > fromCol;
            const rookFromCol = isKingside ? 7 : 0;
            const rookToCol = isKingside ? 5 : 3;
            const rookRow = fromRow;

            // Move the rook
            this.board[rookRow][rookToCol] = this.board[rookRow][rookFromCol];
            this.board[rookRow][rookFromCol] = null;

            // Update castling rights
            this.castlingRights[this.currentPlayer] = { kingside: false, queenside: false };
        }

        // Update castling rights if rook moves
        if (piece.toLowerCase() === 'r') {
            if (fromCol === 0) {
                this.castlingRights[this.currentPlayer].queenside = false;
            } else if (fromCol === 7) {
                this.castlingRights[this.currentPlayer].kingside = false;
            }
        }

        // Handle en passant
        if (piece.toLowerCase() === 'p' && Math.abs(toRow - fromRow) === 2) {
            this.enPassantTarget = [fromRow + (toRow - fromRow) / 2, fromCol];
        } else {
            this.enPassantTarget = null;
        }
    }

    getValidMoves(row, col) {
        const piece = this.board[row][col];
        if (!piece) return [];

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
        return moves.filter(move => !this.wouldBeInCheck(row, col, move[0], move[1]));
    }

    getPawnMoves(row, col) {
        const piece = this.board[row][col];
        const isWhite = this.isWhitePiece(piece);
        const direction = isWhite ? -1 : 1;
        const startRow = isWhite ? 6 : 1;
        const moves = [];

        // Forward moves
        if (this.isValidSquare(row + direction, col) && !this.board[row + direction][col]) {
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
        return this.getLinearMoves(row, col, [[0, 1], [0, -1], [1, 0], [-1, 0]]);
    }

    getBishopMoves(row, col) {
        return this.getLinearMoves(row, col, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
    }

    getQueenMoves(row, col) {
        return this.getLinearMoves(row, col, [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
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
        const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];

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
        const kingMoves = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

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
        if (this.canCastle(this.currentPlayer, true)) {
            moves.push([row, col + 2]); // Kingside
        }
        if (this.canCastle(this.currentPlayer, false)) {
            moves.push([row, col - 2]); // Queenside
        }

        return moves;
    }

    canCastle(color, kingside) {
        const rights = this.castlingRights[color];
        if (!(kingside ? rights.kingside : rights.queenside)) return false;

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
        if(color === "white"){
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
                if (piece && this.isWhitePiece(piece) === (attackingColor === 'white')) {
                    const moves = this.getValidMovesForAttack(r, c);
                    if (moves.some(move => move[0] === row && move[1] === col)) {
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
            case 'p': return this.getPawnAttacks(row, col);
            case 'r': return this.getRookMoves(row, col);
            case 'n': return this.getKnightMoves(row, col);
            case 'b': return this.getBishopMoves(row, col);
            case 'q': return this.getQueenMoves(row, col);
            case 'k': return this.getKingAttacks(row, col);
            default: return [];
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
        const kingMoves = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

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

        // Flip board so player always plays from bottom
        this.boardFlipped = !isWhite;
        this.renderBoard();
        this.updateGameStatus();
    }

    addMoveToHistory(piece, fromRow, fromCol, toRow, toCol, captured) {
        const moveNotation = this.getMoveNotation(piece, fromRow, fromCol, toRow, toCol, captured);
        this.moveHistory.push({
            notation: moveNotation,
            piece: piece,
            from: [fromRow, fromCol],
            to: [toRow, toCol],
            captured: captured,
            player: this.currentPlayer
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
        const whiteElement = document.getElementById('captured-by-white');
        const blackElement = document.getElementById('captured-by-black');

        if (whiteElement) {
            whiteElement.innerHTML = this.capturedPieces.white
                .map(piece => `<span class="text-lg">${this.getPieceSymbol(piece)}</span>`)
                .join('');
        }

        if (blackElement) {
            blackElement.innerHTML = this.capturedPieces.black
                .map(piece => `<span class="text-lg">${this.getPieceSymbol(piece)}</span>`)
                .join('');
        }
    }

    endGame(winner) {
        this.gameOver = true;
        this.winner = winner;

        let statusMessage = '';
        if (winner === 'draw') {
            statusMessage = '🤝 Draw! Good game!';
        } else {
            statusMessage = `🏆 ${winner.charAt(0).toUpperCase() + winner.slice(1)} wins!`;
        }

        this.updateGameStatus(statusMessage);
    }

    updateGameStatus(message = null) {
        const statusElement = document.getElementById('game-status');
        const turnElement = document.getElementById('current-player-text');

        if (message) {
            statusElement.textContent = message;
        } else if (this.gameOver) {
            statusElement.textContent = 'Game Over!';
        } else {
            const currentPlayerText = this.currentPlayer === 'white' ? 'White' : 'Black';
            statusElement.textContent = `${currentPlayerText}'s turn to move.`;

            if (turnElement) {
                turnElement.textContent = `${currentPlayerText}'s Turn`;
                turnElement.parentElement.className = `badge badge-lg ${
                    this.currentPlayer === 'white' ? 'badge-primary' : 'badge-secondary'
                }`;
            }
        }
    }

    restart() {
        this.board = this.createInitialBoard();
        this.currentPlayer = 'white';
        this.gameOver = false;
        this.winner = null;
        this.moveHistory = [];
        this.selectedSquare = null;
        this.validMoves = [];
        this.capturedPieces = { white: [], black: [] };
        this.enPassantTarget = null;
        this.castlingRights = {
            white: { kingside: true, queenside: true },
            black: { kingside: true, queenside: true }
        };
        this.kingPositions = { white: [7, 4], black: [0, 4] };

        // Clear move history display
        const historyElement = document.getElementById('move-history');
        if (historyElement) {
            historyElement.innerHTML = '<div class="text-sm opacity-70">No moves yet</div>';
        }

        this.updateCapturedPieces();
        this.renderBoard();
        this.updateGameStatus();
    }
}

// Global game instance
let chessGame;

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', function() {
    chessGame = new ChessGame();
});

// Global functions for UI
function startGame(playAsWhite = true) {
    if (!chessGame) {
        chessGame = new ChessGame();
    }

    chessGame.restart();
    chessGame.setPlayerColor(playAsWhite);

    // Update button states
    const whiteBtn = document.getElementById('play-as-white-btn');
    const blackBtn = document.getElementById('play-as-black-btn');

    if (whiteBtn && blackBtn) {
        whiteBtn.classList.toggle('btn-primary', playAsWhite);
        whiteBtn.classList.toggle('btn-outline', !playAsWhite);
        blackBtn.classList.toggle('btn-secondary', !playAsWhite);
        blackBtn.classList.toggle('btn-outline', playAsWhite);
    }
}

// Function called by the main UI restart button
function restartGame() {
    if (chessGame) {
        chessGame.restart();
    }
}

// Modal functions (used by game.ejs)
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('modal-open');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('modal-open');
    }
}