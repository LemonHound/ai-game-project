// Chess Game with Complete Rules
let currentUser = null;
let gameActive = false;
let gameStarted = false;
let playerColor = 'white';
let currentPlayer = 'white';
let board = [];
let selectedSquare = null;
let validMoves = [];
let lastMove = null;
let boardFlipped = false;
let moveHistory = [];
let capturedPieces = { player: [], ai: [] };
let draggedPiece = null;
let draggedFrom = null;
let kingPositions = { white: [7, 4], black: [0, 4] };
let castlingRights = { white: { kingside: true, queenside: true }, black: { kingside: true, queenside: true } };
let enPassantTarget = null;
let pendingPromotion = null; // Stores {fromRow, fromCol, toRow, toCol, isWhite}

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function deleteCookie(name) {
    document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}

async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/me', {
            credentials: 'include',
            headers: { Accept: 'application/json' },
            cache: 'no-cache',
        });

        if (response.ok) {
            currentUser = await response.json();
            updateUIForAuthenticatedUser(currentUser);
            showGameContainer();
            initializeGame();
        } else {
            showAuthGate();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        showAuthGate();
    }
}

function updateUIForAuthenticatedUser(user) {
    const loggedOut = document.getElementById('auth-logged-out');
    const loggedIn = document.getElementById('auth-logged-in');

    if (loggedOut) loggedOut.classList.add('hidden');
    if (loggedIn) loggedIn.classList.remove('hidden');

    const displayName = document.getElementById('user-display-name');
    if (displayName) displayName.textContent = user.displayName || user.username;

    const initial = (user.displayName || user.username || 'U')[0].toUpperCase();
    const userInitial = document.getElementById('user-initial');
    if (userInitial) userInitial.textContent = initial;

    if (user.profilePicture) {
        const avatar = document.getElementById('user-avatar');
        if (avatar) {
            avatar.src = user.profilePicture;
            avatar.classList.remove('hidden');
            if (userInitial) userInitial.classList.add('hidden');
        }
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

function initializeGame() {
    const newGameBtn = document.getElementById('new-game-btn');
    const flipBoardBtn = document.getElementById('flip-board-btn');
    const quitGameBtn = document.getElementById('quit-game-btn');
    const logoutBtn = document.getElementById('logout-btn');

    if (newGameBtn) newGameBtn.addEventListener('click', resetGame);
    if (flipBoardBtn) flipBoardBtn.addEventListener('click', flipBoard);
    if (quitGameBtn) quitGameBtn.addEventListener('click', quitGame);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);

    resetGame();
}

async function handleLogout() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
        });
        deleteCookie('sessionId');
        window.location.href = '/';
    } catch (error) {
        console.error('Logout failed:', error);
    }
}

function startGame(isWhite) {
    playerColor = isWhite ? 'white' : 'black';
    boardFlipped = !isWhite; // Flip board so player's pieces are at bottom
    gameStarted = true;
    gameActive = true;

    const overlay = document.getElementById('color-selection-overlay');
    if (overlay) overlay.classList.add('hidden');

    createBoard();
    updateGameStatus();

    // If playing as black, AI (white) moves first
    if (!isWhite) {
        setTimeout(makeAIMove, 500);
    }
}

function resetGame() {
    board = createInitialBoard();
    currentPlayer = 'white';
    gameActive = false;
    gameStarted = false;
    selectedSquare = null;
    validMoves = [];
    lastMove = null;
    boardFlipped = false;
    playerColor = 'white';
    moveHistory = [];
    capturedPieces = { player: [], ai: [] };
    kingPositions = { white: [7, 4], black: [0, 4] };
    castlingRights = { white: { kingside: true, queenside: true }, black: { kingside: true, queenside: true } };
    enPassantTarget = null;
    pendingPromotion = null;

    const overlay = document.getElementById('color-selection-overlay');
    if (overlay) overlay.classList.remove('hidden');

    const historyEl = document.getElementById('move-history');
    if (historyEl) historyEl.innerHTML = '';

    updateCapturedPieces();
    createBoard();
    updateGameStatus();
}

function createInitialBoard() {
    return [
        ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
        ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
        ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
    ];
}

function createBoard() {
    const boardEl = document.getElementById('chess-board');
    if (!boardEl) return;

    boardEl.innerHTML = '';

    // Create squares in display order (accounting for flip)
    for (let displayRow = 0; displayRow < 8; displayRow++) {
        for (let displayCol = 0; displayCol < 8; displayCol++) {
            // Convert display coordinates to actual board coordinates
            const row = boardFlipped ? 7 - displayRow : displayRow;
            const col = boardFlipped ? 7 - displayCol : displayCol;

            const square = document.createElement('div');
            const isLight = (displayRow + displayCol) % 2 === 0;

            square.className = `chess-square flex items-center justify-center ${
                isLight ? 'bg-amber-100' : 'bg-amber-700'
            }`;
            square.dataset.row = row;
            square.dataset.col = col;

            square.addEventListener('click', () => handleSquareClick(row, col));

            const piece = board[row][col];
            if (piece) {
                const pieceEl = createPieceElement(piece, row, col);
                square.appendChild(pieceEl);
            }

            boardEl.appendChild(square);
        }
    }

    renderBoard();
}

function createPieceElement(piece, row, col) {
    const img = document.createElement('img');
    const color = isWhitePiece(piece) ? 'white' : 'black';
    const pieceType = piece.toLowerCase();

    img.src = `/static/images/${pieceType}_${color}.png`;
    img.alt = `${color} ${pieceType}`;
    img.className = 'chess-piece w-full h-full object-contain p-1';
    img.draggable = false;
    img.dataset.row = row;
    img.dataset.col = col;

    if (gameStarted && gameActive) {
        img.addEventListener('mousedown', e => handleDragStart(e, row, col));
    }

    return img;
}

function renderBoard() {
    const boardEl = document.getElementById('chess-board');
    if (!boardEl) return;

    const squares = boardEl.querySelectorAll('.chess-square');

    squares.forEach(square => {
        const row = parseInt(square.dataset.row);
        const col = parseInt(square.dataset.col);

        // Remove old indicators
        square.querySelectorAll('.move-indicator, .capture-indicator').forEach(el => el.remove());

        // Remove highlight classes
        square.classList.remove('last-move-highlight', 'ring-4', 'ring-primary');

        if (
            lastMove &&
            ((lastMove.from[0] === row && lastMove.from[1] === col) ||
                (lastMove.to[0] === row && lastMove.to[1] === col))
        ) {
            square.classList.add('last-move-highlight');
        }

        if (selectedSquare && selectedSquare[0] === row && selectedSquare[1] === col) {
            square.classList.add('ring-4', 'ring-primary');
        }

        const hasValidMove = validMoves.some(m => m[0] === row && m[1] === col);
        if (hasValidMove) {
            const indicator = document.createElement('div');
            indicator.className = board[row][col] ? 'capture-indicator' : 'move-indicator';
            square.appendChild(indicator);
        }
    });
}

function handleSquareClick(row, col) {
    if (!gameActive || !gameStarted || currentPlayer !== playerColor) return;

    if (!selectedSquare) {
        const piece = board[row][col];
        if (piece && isPlayerPiece(piece)) {
            selectedSquare = [row, col];
            validMoves = getValidMoves(row, col);
            renderBoard();
        }
        return;
    }

    if (selectedSquare[0] === row && selectedSquare[1] === col) {
        selectedSquare = null;
        validMoves = [];
        renderBoard();
        return;
    }

    const isValid = validMoves.some(m => m[0] === row && m[1] === col);
    if (isValid) {
        makeMove(selectedSquare[0], selectedSquare[1], row, col);
    } else {
        const piece = board[row][col];
        if (piece && isPlayerPiece(piece)) {
            selectedSquare = [row, col];
            validMoves = getValidMoves(row, col);
            renderBoard();
        } else {
            selectedSquare = null;
            validMoves = [];
            renderBoard();
        }
    }
}

function handleDragStart(e, row, col) {
    if (!gameActive || !gameStarted || currentPlayer !== playerColor) return;

    const piece = board[row][col];
    if (!piece || !isPlayerPiece(piece)) return;

    e.preventDefault();

    draggedPiece = piece;
    draggedFrom = [row, col];
    selectedSquare = [row, col];
    validMoves = getValidMoves(row, col);

    const dragImg = document.getElementById('drag-piece');
    if (dragImg) {
        const color = isWhitePiece(piece) ? 'white' : 'black';
        const pieceType = piece.toLowerCase();
        dragImg.src = `/static/images/${pieceType}_${color}.png`;
        dragImg.classList.remove('hidden');
        dragImg.style.left = e.clientX - 30 + 'px';
        dragImg.style.top = e.clientY - 30 + 'px';
    }

    e.target.classList.add('dragging');
    renderBoard();
}

function handleDragMove(e) {
    if (!draggedPiece) return;

    const dragImg = document.getElementById('drag-piece');
    if (dragImg) {
        dragImg.style.left = e.clientX - 30 + 'px';
        dragImg.style.top = e.clientY - 30 + 'px';
    }
}

function handleDragEnd(e) {
    if (!draggedPiece) return;

    const dragImg = document.getElementById('drag-piece');
    if (dragImg) dragImg.classList.add('hidden');

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const square = target?.closest('.chess-square');

    if (square) {
        const toRow = parseInt(square.dataset.row);
        const toCol = parseInt(square.dataset.col);

        const isValid = validMoves.some(m => m[0] === toRow && m[1] === toCol);
        if (isValid) {
            makeMove(draggedFrom[0], draggedFrom[1], toRow, toCol);
        }
    }

    const draggingPiece = document.querySelector('.dragging');
    if (draggingPiece) draggingPiece.classList.remove('dragging');

    draggedPiece = null;
    draggedFrom = null;
    selectedSquare = null;
    validMoves = [];

    createBoard();
}

function makeMove(fromRow, fromCol, toRow, toCol) {
    const piece = board[fromRow][fromCol];
    const captured = board[toRow][toCol];
    const isWhite = isWhitePiece(piece);

    // Check for pawn promotion
    if (piece.toLowerCase() === 'p') {
        const promotionRank = isWhite ? 0 : 7;
        if (toRow === promotionRank) {
            // Store move and show promotion dialog
            pendingPromotion = { fromRow, fromCol, toRow, toCol, isWhite, captured };
            showPromotionDialog(isWhite);
            return;
        }
    }

    // Execute the move
    executeMoveInternal(fromRow, fromCol, toRow, toCol, piece, captured);
}

function executeMoveInternal(fromRow, fromCol, toRow, toCol, piece, captured, promotionPiece = null) {
    const isWhite = isWhitePiece(piece);

    // If promotion, use the promoted piece
    const finalPiece = promotionPiece || piece;

    // Handle castling
    if (piece.toLowerCase() === 'k' && Math.abs(toCol - fromCol) === 2) {
        const isKingside = toCol > fromCol;
        const rookFromCol = isKingside ? 7 : 0;
        const rookToCol = isKingside ? toCol - 1 : toCol + 1;

        board[toRow][toCol] = piece;
        board[fromRow][fromCol] = null;
        board[fromRow][rookToCol] = board[fromRow][rookFromCol];
        board[fromRow][rookFromCol] = null;

        kingPositions[currentPlayer] = [toRow, toCol];
    }
    // Handle en passant
    else if (
        piece.toLowerCase() === 'p' &&
        enPassantTarget &&
        toRow === enPassantTarget[0] &&
        toCol === enPassantTarget[1]
    ) {
        const capturedRow = isWhite ? toRow + 1 : toRow - 1;
        const capturedPawn = board[capturedRow][toCol];
        if (capturedPawn) {
            capturedPieces.player.push(capturedPawn);
        }
        board[capturedRow][toCol] = null;
        board[toRow][toCol] = finalPiece;
        board[fromRow][fromCol] = null;
    }
    // Regular move
    else {
        if (captured) {
            capturedPieces.player.push(captured);
        }
        board[toRow][toCol] = finalPiece;
        board[fromRow][fromCol] = null;

        if (piece.toLowerCase() === 'k') {
            kingPositions[currentPlayer] = [toRow, toCol];
        }
    }

    // Update castling rights
    if (piece.toLowerCase() === 'k') {
        castlingRights[currentPlayer].kingside = false;
        castlingRights[currentPlayer].queenside = false;
    } else if (piece.toLowerCase() === 'r') {
        if (fromCol === 0) castlingRights[currentPlayer].queenside = false;
        if (fromCol === 7) castlingRights[currentPlayer].kingside = false;
    }

    // Set en passant target
    if (piece.toLowerCase() === 'p' && Math.abs(toRow - fromRow) === 2) {
        enPassantTarget = [isWhite ? fromRow - 1 : fromRow + 1, fromCol];
    } else {
        enPassantTarget = null;
    }

    lastMove = { from: [fromRow, fromCol], to: [toRow, toCol], piece: finalPiece };
    addMoveToHistory(finalPiece, fromRow, fromCol, toRow, toCol, captured);

    selectedSquare = null;
    validMoves = [];

    currentPlayer = currentPlayer === 'white' ? 'black' : 'white';

    createBoard();
    updateGameStatus();
    updateCapturedPieces();

    // Check for checkmate/stalemate
    if (isCheckmate(currentPlayer)) {
        gameActive = false;
        const winner = currentPlayer === 'white' ? 'Black' : 'White';
        updateGameStatus(`Checkmate! ${winner} wins!`);
        return;
    }
    if (isStalemate(currentPlayer)) {
        gameActive = false;
        updateGameStatus('Stalemate! Draw!');
        return;
    }

    if (currentPlayer !== playerColor && gameActive) {
        setTimeout(makeAIMove, 500);
    }
}

function showPromotionDialog(isWhite) {
    const overlay = document.getElementById('promotion-overlay');
    const color = isWhite ? 'white' : 'black';

    // Set piece images
    document.getElementById('promotion-queen').src = `/static/images/q_${color}.png`;
    document.getElementById('promotion-rook').src = `/static/images/r_${color}.png`;
    document.getElementById('promotion-bishop').src = `/static/images/b_${color}.png`;
    document.getElementById('promotion-knight').src = `/static/images/n_${color}.png`;

    if (overlay) overlay.classList.remove('hidden');
}

function selectPromotion(pieceType) {
    if (!pendingPromotion) return;

    const overlay = document.getElementById('promotion-overlay');
    if (overlay) overlay.classList.add('hidden');

    const { fromRow, fromCol, toRow, toCol, isWhite, captured } = pendingPromotion;
    const promotedPiece = isWhite ? pieceType.toUpperCase() : pieceType.toLowerCase();
    const originalPiece = board[fromRow][fromCol];

    pendingPromotion = null;

    executeMoveInternal(fromRow, fromCol, toRow, toCol, originalPiece, captured, promotedPiece);
}

function makeAIMove() {
    const aiPieces = [];
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece && isAIPiece(piece)) {
                const moves = getValidMoves(row, col);
                if (moves.length > 0) {
                    aiPieces.push({ row, col, moves });
                }
            }
        }
    }

    if (aiPieces.length === 0) return;

    const randomPiece = aiPieces[Math.floor(Math.random() * aiPieces.length)];
    const randomMove = randomPiece.moves[Math.floor(Math.random() * randomPiece.moves.length)];

    const piece = board[randomPiece.row][randomPiece.col];
    const captured = board[randomMove[0]][randomMove[1]];
    const isWhite = isWhitePiece(piece);

    // Check for AI pawn promotion
    let promotedPiece = piece;
    if (piece.toLowerCase() === 'p') {
        const promotionRank = isWhite ? 0 : 7;
        if (randomMove[0] === promotionRank) {
            // AI always promotes to queen
            promotedPiece = isWhite ? 'Q' : 'q';
        }
    }

    // Handle castling
    if (piece.toLowerCase() === 'k' && Math.abs(randomMove[1] - randomPiece.col) === 2) {
        const isKingside = randomMove[1] > randomPiece.col;
        const rookFromCol = isKingside ? 7 : 0;
        const rookToCol = isKingside ? randomMove[1] - 1 : randomMove[1] + 1;

        board[randomMove[0]][randomMove[1]] = piece;
        board[randomPiece.row][randomPiece.col] = null;
        board[randomPiece.row][rookToCol] = board[randomPiece.row][rookFromCol];
        board[randomPiece.row][rookFromCol] = null;

        kingPositions[currentPlayer] = [randomMove[0], randomMove[1]];
    }
    // Handle en passant
    else if (
        piece.toLowerCase() === 'p' &&
        enPassantTarget &&
        randomMove[0] === enPassantTarget[0] &&
        randomMove[1] === enPassantTarget[1]
    ) {
        const capturedRow = isWhite ? randomMove[0] + 1 : randomMove[0] - 1;
        const capturedPawn = board[capturedRow][randomMove[1]];
        if (capturedPawn) {
            capturedPieces.ai.push(capturedPawn);
        }
        board[capturedRow][randomMove[1]] = null;
        board[randomMove[0]][randomMove[1]] = promotedPiece;
        board[randomPiece.row][randomPiece.col] = null;
    }
    // Regular move
    else {
        if (captured) {
            capturedPieces.ai.push(captured);
        }
        board[randomMove[0]][randomMove[1]] = promotedPiece;
        board[randomPiece.row][randomPiece.col] = null;

        if (piece.toLowerCase() === 'k') {
            kingPositions[currentPlayer] = [randomMove[0], randomMove[1]];
        }
    }

    // Update castling rights
    if (piece.toLowerCase() === 'k') {
        castlingRights[currentPlayer].kingside = false;
        castlingRights[currentPlayer].queenside = false;
    } else if (piece.toLowerCase() === 'r') {
        if (randomPiece.col === 0) castlingRights[currentPlayer].queenside = false;
        if (randomPiece.col === 7) castlingRights[currentPlayer].kingside = false;
    }

    // Set en passant target
    if (piece.toLowerCase() === 'p' && Math.abs(randomMove[0] - randomPiece.row) === 2) {
        enPassantTarget = [isWhite ? randomPiece.row - 1 : randomPiece.row + 1, randomPiece.col];
    } else {
        enPassantTarget = null;
    }

    lastMove = {
        from: [randomPiece.row, randomPiece.col],
        to: [randomMove[0], randomMove[1]],
        piece: promotedPiece,
    };

    addMoveToHistory(promotedPiece, randomPiece.row, randomPiece.col, randomMove[0], randomMove[1], captured);

    currentPlayer = currentPlayer === 'white' ? 'black' : 'white';

    createBoard();
    updateGameStatus();
    updateCapturedPieces();

    // Check for checkmate/stalemate
    if (isCheckmate(currentPlayer)) {
        gameActive = false;
        const winner = currentPlayer === 'white' ? 'Black' : 'White';
        updateGameStatus(`Checkmate! ${winner} wins!`);
    } else if (isStalemate(currentPlayer)) {
        gameActive = false;
        updateGameStatus('Stalemate! Draw!');
    }
}

function getValidMoves(row, col) {
    const piece = board[row][col];
    if (!piece) return [];

    let moves = [];
    const pieceType = piece.toLowerCase();

    if (pieceType === 'p') {
        moves = getPawnMoves(row, col);
    } else if (pieceType === 'r') {
        moves = getLinearMoves(row, col, [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
        ]);
    } else if (pieceType === 'b') {
        moves = getLinearMoves(row, col, [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
        ]);
    } else if (pieceType === 'q') {
        moves = getLinearMoves(row, col, [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
        ]);
    } else if (pieceType === 'n') {
        moves = getKnightMoves(row, col);
    } else if (pieceType === 'k') {
        moves = getKingMoves(row, col);
    }

    // Filter moves that would leave king in check
    return moves.filter(([toRow, toCol]) => !wouldBeInCheck(row, col, toRow, toCol));
}

function getPawnMoves(row, col) {
    const piece = board[row][col];
    const isWhite = isWhitePiece(piece);
    const direction = isWhite ? -1 : 1;
    const startRow = isWhite ? 6 : 1;
    const moves = [];

    // Forward one
    if (isValidSquare(row + direction, col) && !board[row + direction][col]) {
        moves.push([row + direction, col]);

        // Forward two from start
        if (row === startRow && !board[row + 2 * direction][col]) {
            moves.push([row + 2 * direction, col]);
        }
    }

    // Diagonal captures
    for (const dcol of [-1, 1]) {
        const newRow = row + direction;
        const newCol = col + dcol;
        if (isValidSquare(newRow, newCol)) {
            const target = board[newRow][newCol];
            if (target && isWhitePiece(target) !== isWhite) {
                moves.push([newRow, newCol]);
            }
            // En passant
            if (enPassantTarget && newRow === enPassantTarget[0] && newCol === enPassantTarget[1]) {
                moves.push([newRow, newCol]);
            }
        }
    }

    return moves;
}

function getKnightMoves(row, col) {
    const piece = board[row][col];
    const isWhite = isWhitePiece(piece);
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

    knightMoves.forEach(([dr, dc]) => {
        const newRow = row + dr;
        const newCol = col + dc;
        if (isValidSquare(newRow, newCol)) {
            const target = board[newRow][newCol];
            if (!target || isWhitePiece(target) !== isWhite) {
                moves.push([newRow, newCol]);
            }
        }
    });

    return moves;
}

function getKingMoves(row, col) {
    const piece = board[row][col];
    const isWhite = isWhitePiece(piece);
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

    kingMoves.forEach(([dr, dc]) => {
        const newRow = row + dr;
        const newCol = col + dc;
        if (isValidSquare(newRow, newCol)) {
            const target = board[newRow][newCol];
            if (!target || isWhitePiece(target) !== isWhite) {
                moves.push([newRow, newCol]);
            }
        }
    });

    // Castling
    const color = currentPlayer;
    if (canCastle(color, true)) {
        moves.push([row, col + 2]); // Kingside
    }
    if (canCastle(color, false)) {
        moves.push([row, col - 2]); // Queenside
    }

    return moves;
}

function getLinearMoves(row, col, directions) {
    const piece = board[row][col];
    const isWhite = isWhitePiece(piece);
    const moves = [];

    directions.forEach(([dr, dc]) => {
        for (let i = 1; i < 8; i++) {
            const newRow = row + dr * i;
            const newCol = col + dc * i;
            if (!isValidSquare(newRow, newCol)) break;
            const target = board[newRow][newCol];
            if (!target) {
                moves.push([newRow, newCol]);
            } else {
                if (isWhitePiece(target) !== isWhite) {
                    moves.push([newRow, newCol]);
                }
                break;
            }
        }
    });

    return moves;
}

function canCastle(color, kingside) {
    const rights = castlingRights[color];
    if (!rights[kingside ? 'kingside' : 'queenside']) return false;
    if (isInCheck(color)) return false;

    const [kingRow, kingCol] = kingPositions[color];
    const rookCol = kingside ? 7 : 0;
    const direction = kingside ? 1 : -1;

    // Check if path is clear
    for (let col = kingCol + direction; col !== rookCol; col += direction) {
        if (board[kingRow][col]) return false;
    }

    // Check if king passes through or lands on attacked square
    for (let i = 0; i <= 2; i++) {
        if (isSquareAttacked(kingRow, kingCol + i * direction, color)) {
            return false;
        }
    }

    return true;
}

function wouldBeInCheck(fromRow, fromCol, toRow, toCol) {
    const originalPiece = board[toRow][toCol];
    const movingPiece = board[fromRow][fromCol];

    board[toRow][toCol] = movingPiece;
    board[fromRow][fromCol] = null;

    let originalKingPos = null;
    if (movingPiece.toLowerCase() === 'k') {
        originalKingPos = [...kingPositions[currentPlayer]];
        kingPositions[currentPlayer] = [toRow, toCol];
    }

    const inCheck = isInCheck(currentPlayer);

    board[fromRow][fromCol] = movingPiece;
    board[toRow][toCol] = originalPiece;

    if (originalKingPos) {
        kingPositions[currentPlayer] = originalKingPos;
    }

    return inCheck;
}

function isInCheck(color) {
    const [kingRow, kingCol] = kingPositions[color];
    return isSquareAttacked(kingRow, kingCol, color);
}

function isSquareAttacked(row, col, defendingColor) {
    const attackingColor = defendingColor === 'white' ? 'black' : 'white';

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && (attackingColor === 'white') === isWhitePiece(piece)) {
                const attacks = getPieceAttacks(r, c);
                if (attacks.some(([ar, ac]) => ar === row && ac === col)) {
                    return true;
                }
            }
        }
    }
    return false;
}

function getPieceAttacks(row, col) {
    const piece = board[row][col];
    if (!piece) return [];

    const pieceType = piece.toLowerCase();

    if (pieceType === 'p') {
        const isWhite = isWhitePiece(piece);
        const direction = isWhite ? -1 : 1;
        const attacks = [];
        for (const dcol of [-1, 1]) {
            const newRow = row + direction;
            const newCol = col + dcol;
            if (isValidSquare(newRow, newCol)) {
                attacks.push([newRow, newCol]);
            }
        }
        return attacks;
    } else if (pieceType === 'n') {
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
        knightMoves.forEach(([dr, dc]) => {
            const newRow = row + dr;
            const newCol = col + dc;
            if (isValidSquare(newRow, newCol)) {
                moves.push([newRow, newCol]);
            }
        });
        return moves;
    } else if (pieceType === 'b') {
        return getLinearMoves(row, col, [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
        ]);
    } else if (pieceType === 'r') {
        return getLinearMoves(row, col, [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
        ]);
    } else if (pieceType === 'q') {
        return getLinearMoves(row, col, [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
        ]);
    } else if (pieceType === 'k') {
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
        kingMoves.forEach(([dr, dc]) => {
            const newRow = row + dr;
            const newCol = col + dc;
            if (isValidSquare(newRow, newCol)) {
                moves.push([newRow, newCol]);
            }
        });
        return moves;
    }

    return [];
}

function isCheckmate(color) {
    if (!isInCheck(color)) return false;
    return !hasValidMoves(color);
}

function isStalemate(color) {
    if (isInCheck(color)) return false;
    return !hasValidMoves(color);
}

function hasValidMoves(color) {
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece && (color === 'white') === isWhitePiece(piece)) {
                const moves = getValidMoves(row, col);
                if (moves.length > 0) return true;
            }
        }
    }
    return false;
}

function isValidSquare(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function isWhitePiece(piece) {
    return piece === piece.toUpperCase();
}

function isPlayerPiece(piece) {
    return (playerColor === 'white' && isWhitePiece(piece)) || (playerColor === 'black' && !isWhitePiece(piece));
}

function isAIPiece(piece) {
    return !isPlayerPiece(piece);
}

function flipBoard() {
    boardFlipped = !boardFlipped;
    createBoard();
}

function addMoveToHistory(piece, fromRow, fromCol, toRow, toCol, captured) {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const from = files[fromCol] + (8 - fromRow);
    const to = files[toCol] + (8 - toRow);
    const notation = `${piece.toUpperCase()}${captured ? 'x' : ''}${to}`;

    const historyEl = document.getElementById('move-history');
    if (historyEl) {
        const moveEl = document.createElement('div');
        moveEl.className = 'text-xs p-1 hover:bg-base-200 rounded';
        moveEl.textContent = `${Math.floor(moveHistory.length / 2) + 1}. ${notation}`;
        historyEl.appendChild(moveEl);
        historyEl.scrollTop = historyEl.scrollHeight;
    }

    moveHistory.push({ notation, from: [fromRow, fromCol], to: [toRow, toCol] });
}

function updateCapturedPieces() {
    const playerCapturedEl = document.getElementById('player-captured');
    const aiCapturedEl = document.getElementById('ai-captured');

    if (playerCapturedEl) {
        playerCapturedEl.innerHTML = capturedPieces.player
            .sort((a, b) => PIECE_VALUES[b.toLowerCase()] - PIECE_VALUES[a.toLowerCase()])
            .map(piece => {
                const color = isWhitePiece(piece) ? 'white' : 'black';
                const pieceType = piece.toLowerCase();
                return `<img src="/static/images/${pieceType}_${color}.png" alt="${color} ${pieceType}" class="w-6 h-6 object-contain">`;
            })
            .join('');
    }

    if (aiCapturedEl) {
        aiCapturedEl.innerHTML = capturedPieces.ai
            .sort((a, b) => PIECE_VALUES[b.toLowerCase()] - PIECE_VALUES[a.toLowerCase()])
            .map(piece => {
                const color = isWhitePiece(piece) ? 'white' : 'black';
                const pieceType = piece.toLowerCase();
                return `<img src="/static/images/${pieceType}_${color}.png" alt="${color} ${pieceType}" class="w-6 h-6 object-contain">`;
            })
            .join('');
    }
}

function updateGameStatus(customMessage = null) {
    const turnEl = document.getElementById('current-turn');
    const statusEl = document.getElementById('game-status');

    if (customMessage) {
        if (statusEl) statusEl.textContent = customMessage;
        if (turnEl) turnEl.textContent = '';
        return;
    }

    if (!gameStarted) {
        if (turnEl) turnEl.textContent = '';
        if (statusEl) statusEl.textContent = '';
        return;
    }

    if (!gameActive) {
        if (turnEl) turnEl.textContent = 'Game Over';
        return;
    }

    const turnText = currentPlayer === playerColor ? 'Your Turn' : "AI's Turn";
    const colorText = currentPlayer.charAt(0).toUpperCase() + currentPlayer.slice(1);

    if (turnEl) turnEl.textContent = `${colorText} - ${turnText}`;

    if (statusEl) {
        if (isInCheck(currentPlayer)) {
            statusEl.textContent = '⚠️ Check!';
        } else {
            statusEl.textContent = '';
        }
    }
}

function quitGame() {
    window.location.href = '/games';
}

function openLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.showModal();
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
});
