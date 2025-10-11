// Chess Game with Backend Integration
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
let pendingPromotion = null;
let gameSessionId = null;
let aiThinking = false;

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

async function startGame(isWhite) {
    playerColor = isWhite ? 'white' : 'black';
    boardFlipped = !isWhite;
    gameStarted = true;
    gameActive = true;

    const overlay = document.getElementById('color-selection-overlay');
    if (overlay) overlay.classList.add('hidden');

    try {
        // Call backend to start game
        const response = await fetch('/api/game/chess/start', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                difficulty: 'medium',
                playerStarts: isWhite,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to start game');
        }

        const data = await response.json();
        gameSessionId = data.gameSessionId;
        board = data.boardState;
        currentPlayer = data.currentPlayer;

        createBoard();
        updateGameStatus();

        // If playing as black, AI moves first
        if (!isWhite) {
            // The backend will have already generated the AI move
            // We just need to wait a moment for visual effect
            setTimeout(() => {
                updateGameStatus();
            }, 500);
        }
    } catch (error) {
        console.error('Error starting game:', error);
        alert('Failed to start game. Please try again.');
        resetGame();
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
    pendingPromotion = null;
    gameSessionId = null;
    aiThinking = false;

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

    for (let displayRow = 0; displayRow < 8; displayRow++) {
        for (let displayCol = 0; displayCol < 8; displayCol++) {
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

    if (gameStarted && gameActive && !aiThinking) {
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

        square.querySelectorAll('.move-indicator, .capture-indicator').forEach(el => el.remove());
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
    if (!gameActive || !gameStarted || currentPlayer !== playerColor || aiThinking) return;

    if (!selectedSquare) {
        const piece = board[row][col];
        if (piece && isPlayerPiece(piece)) {
            selectedSquare = [row, col];
            validMoves = getValidMovesLocal(row, col);
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
            validMoves = getValidMovesLocal(row, col);
            renderBoard();
        } else {
            selectedSquare = null;
            validMoves = [];
            renderBoard();
        }
    }
}

function handleDragStart(e, row, col) {
    if (!gameActive || !gameStarted || currentPlayer !== playerColor || aiThinking) return;

    const piece = board[row][col];
    if (!piece || !isPlayerPiece(piece)) return;

    e.preventDefault();

    draggedPiece = piece;
    draggedFrom = [row, col];
    selectedSquare = [row, col];
    validMoves = getValidMovesLocal(row, col);

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

async function makeMove(fromRow, fromCol, toRow, toCol) {
    const piece = board[fromRow][fromCol];
    const isWhite = isWhitePiece(piece);

    // Check for pawn promotion
    if (piece.toLowerCase() === 'p') {
        const promotionRank = isWhite ? 0 : 7;
        if (toRow === promotionRank) {
            pendingPromotion = { fromRow, fromCol, toRow, toCol, isWhite };
            showPromotionDialog(isWhite);
            return;
        }
    }

    await executeMoveWithBackend(fromRow, fromCol, toRow, toCol, null);
}

async function executeMoveWithBackend(fromRow, fromCol, toRow, toCol, promotionPiece = null) {
    aiThinking = true;
    updateGameStatus('Thinking...');

    try {
        const response = await fetch('/api/game/chess/move', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gameSessionId: gameSessionId,
                userId: currentUser.id,
                move: {
                    fromRow,
                    fromCol,
                    toRow,
                    toCol,
                    promotionPiece,
                },
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Invalid move');
        }

        const data = await response.json();

        // Update board state from server
        board = data.boardState;
        currentPlayer = data.currentPlayer;

        // Update last move visualization
        lastMove = { from: [fromRow, fromCol], to: [toRow, toCol] };

        // If AI made a move, visualize it
        if (data.aiMove) {
            setTimeout(() => {
                lastMove = {
                    from: [data.aiMove.fromRow, data.aiMove.fromCol],
                    to: [data.aiMove.toRow, data.aiMove.toCol],
                };
                addMoveToHistory(
                    data.aiMove.piece,
                    data.aiMove.fromRow,
                    data.aiMove.fromCol,
                    data.aiMove.toRow,
                    data.aiMove.toCol,
                    null
                );
                createBoard();
            }, 300);
        }

        selectedSquare = null;
        validMoves = [];

        createBoard();
        updateCapturedPieces();
        addMoveToHistory(board[toRow][toCol] || promotionPiece, fromRow, fromCol, toRow, toCol, null);

        // Check for game end
        if (data.gameOver) {
            gameActive = false;
            if (data.winner === 'draw') {
                updateGameStatus('Stalemate! Draw!');
            } else {
                const winnerText = data.winner === playerColor ? 'You win!' : 'AI wins!';
                updateGameStatus(`Checkmate! ${winnerText}`);
            }
        } else {
            updateGameStatus();
        }
    } catch (error) {
        console.error('Move error:', error);
        alert(error.message || 'Invalid move. Please try again.');
        createBoard();
    } finally {
        aiThinking = false;
        if (gameActive) {
            updateGameStatus();
        }
    }
}

function showPromotionDialog(isWhite) {
    const overlay = document.getElementById('promotion-overlay');
    const color = isWhite ? 'white' : 'black';

    document.getElementById('promotion-queen').src = `/static/images/q_${color}.png`;
    document.getElementById('promotion-rook').src = `/static/images/r_${color}.png`;
    document.getElementById('promotion-bishop').src = `/static/images/b_${color}.png`;
    document.getElementById('promotion-knight').src = `/static/images/n_${color}.png`;

    if (overlay) overlay.classList.remove('hidden');
}

async function selectPromotion(pieceType) {
    if (!pendingPromotion) return;

    const overlay = document.getElementById('promotion-overlay');
    if (overlay) overlay.classList.add('hidden');

    const { fromRow, fromCol, toRow, toCol, isWhite } = pendingPromotion;
    const promotedPiece = isWhite ? pieceType.toUpperCase() : pieceType.toLowerCase();

    pendingPromotion = null;

    await executeMoveWithBackend(fromRow, fromCol, toRow, toCol, promotedPiece);
}

// Local move validation for UI responsiveness
function getValidMovesLocal(row, col) {
    // This is a simplified version for UI responsiveness
    // The backend will do the real validation
    const piece = board[row][col];
    if (!piece) return [];

    const moves = [];
    const pieceType = piece.toLowerCase();

    // Simplified move generation for UI
    // Just show potential squares, backend will validate
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (r === row && c === col) continue;
            // Add basic logic to avoid showing completely invalid moves
            moves.push([r, c]);
        }
    }

    return moves.slice(0, 20); // Limit for performance
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
    if (statusEl) statusEl.textContent = '';
}

function isWhitePiece(piece) {
    return piece === piece.toUpperCase();
}

function isPlayerPiece(piece) {
    return (playerColor === 'white' && isWhitePiece(piece)) || (playerColor === 'black' && !isWhitePiece(piece));
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
