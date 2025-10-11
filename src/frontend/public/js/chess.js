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
let enPassantTarget = null;
let castlingRights = {
    white: { kingside: true, queenside: true },
    black: { kingside: true, queenside: true },
};

let pendingMove = null;
let boardBeforeMove = null;
let evaluator = null;
let analysisEnabled = true;
let currentEvaluation = null;
let isAnalyzing = false;
let realtimePlay = false;

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
    const submitMoveBtn = document.getElementById('submit-move-btn');
    const undoMoveBtn = document.getElementById('undo-move-btn');
    const toggleAnalysisBtn = document.getElementById('toggle-analysis-btn');
    const realtimeToggle = document.getElementById('realtime-toggle');

    if (realtimeToggle)
        realtimeToggle.addEventListener('change', e => {
            realtimePlay = e.target.checked;
        });
    if (newGameBtn) newGameBtn.addEventListener('click', resetGame);
    if (flipBoardBtn) flipBoardBtn.addEventListener('click', flipBoard);
    if (quitGameBtn) quitGameBtn.addEventListener('click', quitGame);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (submitMoveBtn) submitMoveBtn.addEventListener('click', submitMove);
    if (undoMoveBtn) undoMoveBtn.addEventListener('click', undoMove);
    if (toggleAnalysisBtn) toggleAnalysisBtn.addEventListener('click', toggleAnalysis);

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);

    initEvaluator();
    resetGame();
}

function initEvaluator() {
    if (typeof ChessEvaluator === 'undefined') {
        console.error('ChessEvaluator not loaded');
        return;
    }

    evaluator = new ChessEvaluator();
}

function analyzePosition(boardState, gameStatus = {}) {
    if (!evaluator || !analysisEnabled) return;

    isAnalyzing = true;
    currentEvaluation = null;
    updateEvaluationDisplay();

    evaluator.analyze(boardState, gameStatus, 1).then(evaluation => {
        currentEvaluation = evaluation;
        isAnalyzing = false;
        updateEvaluationDisplay();

        if (pendingMove) {
            enableMoveButtons();
        }
    });
}

function updateEvaluationDisplay() {
    const evalBar = document.getElementById('eval-bar');
    const evalText = document.getElementById('eval-text');

    if (!evalBar || !evalText) return;

    if (!currentEvaluation) {
        evalBar.style.height = '50%';
        evalText.textContent = '...';
        return;
    }

    let displayValue;
    let percentage;

    if (currentEvaluation.type === 'mate') {
        const mateIn = currentEvaluation.value;
        displayValue = mateIn > 0 ? `+M${Math.abs(mateIn)}` : `-M${Math.abs(mateIn)}`;
        percentage = mateIn > 0 ? 100 : 0;
    } else {
        const eval_score = currentEvaluation.value;
        displayValue = (eval_score >= 0 ? '+' : '') + eval_score.toFixed(1);

        const clampedEval = Math.max(-10, Math.min(10, eval_score));
        percentage = 50 + (clampedEval / 10) * 50;
    }

    evalBar.style.height = percentage + '%';
    evalText.textContent = displayValue;
}

function toggleAnalysis() {
    analysisEnabled = !analysisEnabled;
    const btn = document.getElementById('toggle-analysis-btn');
    const panel = document.getElementById('analysis-panel');

    if (btn) {
        btn.textContent = analysisEnabled ? 'Disable Analysis' : 'Enable Analysis';
        btn.classList.toggle('btn-error', !analysisEnabled);
    }

    if (panel) {
        panel.style.opacity = analysisEnabled ? '1' : '0.5';
    }

    if (analysisEnabled && board.length > 0) {
        analyzePosition(board, { gameOver: !gameActive });
    } else {
        currentEvaluation = null;
        updateEvaluationDisplay();
    }
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

        enPassantTarget = null;
        castlingRights = {
            white: { kingside: true, queenside: true },
            black: { kingside: true, queenside: true },
        };

        createBoard();
        updateGameStatus();

        if (analysisEnabled) {
            analyzePosition(board, { gameOver: false });
        }

        if (!isWhite) {
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
    enPassantTarget = null;
    castlingRights = {
        white: { kingside: true, queenside: true },
        black: { kingside: true, queenside: true },
    };
    pendingMove = null;
    boardBeforeMove = null;
    currentEvaluation = null;

    const realtimeToggle = document.getElementById('realtime-toggle');
    if (realtimeToggle) realtimeToggle.checked = false;
    realtimePlay = false;

    const overlay = document.getElementById('color-selection-overlay');
    if (overlay) overlay.classList.remove('hidden');

    const historyEl = document.getElementById('move-history');
    if (historyEl) historyEl.innerHTML = '';

    disableMoveButtons();
    updateCapturedPieces();
    createBoard();
    updateGameStatus();
    updateEvaluationDisplay();
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

            const isInteractable = gameStarted && gameActive && currentPlayer === playerColor && !pendingMove;
            if (isInteractable) {
                square.addEventListener('click', () => handleSquareClick(row, col));
            }

            const piece = board[row][col];
            if (piece) {
                const pieceEl = createPieceElement(piece, row, col, isInteractable);
                square.appendChild(pieceEl);
            }

            boardEl.appendChild(square);
        }
    }

    renderBoard();
}

function createPieceElement(piece, row, col, isInteractable) {
    const img = document.createElement('img');
    const color = isWhitePiece(piece) ? 'white' : 'black';
    const pieceType = piece.toLowerCase();

    img.src = `/static/images/${pieceType}_${color}.png`;
    img.alt = `${color} ${pieceType}`;
    img.className = 'chess-piece w-full h-full object-contain p-1';
    img.draggable = false;
    img.dataset.row = row;
    img.dataset.col = col;

    if (isInteractable) {
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
        executeLocalMove(selectedSquare[0], selectedSquare[1], row, col);
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
            executeLocalMove(draggedFrom[0], draggedFrom[1], toRow, toCol);
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

function executeLocalMove(fromRow, fromCol, toRow, toCol) {
    const piece = board[fromRow][fromCol];
    const isWhite = isWhitePiece(piece);

    if (piece.toLowerCase() === 'p') {
        const promotionRank = isWhite ? 0 : 7;
        if (toRow === promotionRank) {
            pendingPromotion = { fromRow, fromCol, toRow, toCol, isWhite };
            showPromotionDialog(isWhite);
            return;
        }
    }

    finishLocalMove(fromRow, fromCol, toRow, toCol, null);
}

function finishLocalMove(fromRow, fromCol, toRow, toCol, promotionPiece) {
    boardBeforeMove = board.map(row => [...row]);

    const piece = board[fromRow][fromCol];
    const captured = board[toRow][toCol];

    board[toRow][toCol] = promotionPiece || piece;
    board[fromRow][fromCol] = null;

    pendingMove = {
        fromRow,
        fromCol,
        toRow,
        toCol,
        promotionPiece,
        captured,
    };

    selectedSquare = null;
    validMoves = [];
    lastMove = { from: [fromRow, fromCol], to: [toRow, toCol] };

    createBoard();
    addMoveToHistory(promotionPiece || piece, fromRow, fromCol, toRow, toCol, captured);

    if (analysisEnabled) {
        analyzePosition(board, { gameOver: false });
    } else {
        enableMoveButtons();
    }
}

function enableMoveButtons() {
    const submitBtn = document.getElementById('submit-move-btn');
    const undoBtn = document.getElementById('undo-move-btn');

    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.add('btn-success');
    }
    if (undoBtn) {
        undoBtn.disabled = false;
    }

    if (realtimePlay) {
        setTimeout(() => {
            submitMove();
        }, 100);
    }
}

function disableMoveButtons() {
    const submitBtn = document.getElementById('submit-move-btn');
    const undoBtn = document.getElementById('undo-move-btn');

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.remove('btn-success');
    }
    if (undoBtn) {
        undoBtn.disabled = true;
    }
}

function undoMove() {
    if (!pendingMove || !boardBeforeMove) return;

    board = boardBeforeMove;
    boardBeforeMove = null;
    pendingMove = null;
    lastMove = null;

    const historyEl = document.getElementById('move-history');
    if (historyEl && moveHistory.length > 0) {
        const moveNumber = Math.floor((moveHistory.length - 1) / 2) + 1;
        const isWhiteMove = (moveHistory.length - 1) % 2 === 0;

        if (isWhiteMove) {
            const moveEl = document.getElementById(`move-${moveNumber}`);
            if (moveEl) moveEl.remove();
        } else {
            const blackSpan = document.getElementById(`move-${moveNumber}-black`);
            if (blackSpan) {
                blackSpan.textContent = '...';
                blackSpan.classList.add('text-base-content/50');
            }
        }

        moveHistory.pop();
    }

    disableMoveButtons();
    createBoard();

    if (analysisEnabled) {
        analyzePosition(board, { gameOver: false });
    }
}

async function submitMove() {
    if (!pendingMove) return;

    disableMoveButtons();
    updateGameStatus('Waiting for opponent...');

    try {
        const response = await fetch('/api/game/chess/move', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gameSessionId: gameSessionId,
                userId: currentUser.id,
                move: {
                    fromRow: pendingMove.fromRow,
                    fromCol: pendingMove.fromCol,
                    toRow: pendingMove.toRow,
                    toCol: pendingMove.toCol,
                    promotionPiece: pendingMove.promotionPiece,
                },
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Invalid move');
        }

        const data = await response.json();

        updateGameStateFromMove(
            pendingMove.fromRow,
            pendingMove.fromCol,
            pendingMove.toRow,
            pendingMove.toCol,
            board[pendingMove.toRow][pendingMove.toCol]
        );

        pendingMove = null;
        boardBeforeMove = null;

        if (data.aiMove) {
            const aiCaptured = board[data.aiMove.toRow][data.aiMove.toCol];

            board = data.boardState;
            currentPlayer = data.currentPlayer;

            setTimeout(() => {
                updateGameStateFromMove(
                    data.aiMove.fromRow,
                    data.aiMove.fromCol,
                    data.aiMove.toRow,
                    data.aiMove.toCol,
                    data.aiMove.piece
                );
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
                    aiCaptured
                );
                createBoard();

                if (analysisEnabled) {
                    analyzePosition(board, {
                        gameOver: data.gameOver,
                        winner: data.winner,
                    });
                }
            }, 300);
        } else {
            board = data.boardState;
            currentPlayer = data.currentPlayer;
            createBoard();
        }

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
        undoMove();
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

    finishLocalMove(fromRow, fromCol, toRow, toCol, promotedPiece);
}

function updateGameStateFromMove(fromRow, fromCol, toRow, toCol, piece) {
    const isWhite = isWhitePiece(piece);
    const color = isWhite ? 'white' : 'black';
    const pieceType = piece.toLowerCase();

    if (pieceType === 'k') {
        castlingRights[color].kingside = false;
        castlingRights[color].queenside = false;
        kingPositions[color] = [toRow, toCol];
    }

    if (pieceType === 'r') {
        if (fromCol === 0) {
            castlingRights[color].queenside = false;
        } else if (fromCol === 7) {
            castlingRights[color].kingside = false;
        }
    }

    if (pieceType === 'p' && Math.abs(toRow - fromRow) === 2) {
        enPassantTarget = [fromRow + (isWhite ? -1 : 1), fromCol];
    } else {
        enPassantTarget = null;
    }
}

function getValidMovesLocal(row, col) {
    const piece = board[row][col];
    if (!piece) return [];

    const isWhite = isWhitePiece(piece);
    const pieceType = piece.toLowerCase();
    let moves = [];

    switch (pieceType) {
        case 'p':
            moves = getPawnMoves(row, col, isWhite);
            break;
        case 'r':
            moves = getLinearMoves(row, col, [
                [0, 1],
                [0, -1],
                [1, 0],
                [-1, 0],
            ]);
            break;
        case 'n':
            moves = getKnightMoves(row, col);
            break;
        case 'b':
            moves = getLinearMoves(row, col, [
                [1, 1],
                [1, -1],
                [-1, 1],
                [-1, -1],
            ]);
            break;
        case 'q':
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
            break;
        case 'k':
            moves = getKingMoves(row, col);
            break;
    }

    return moves.filter(m => !wouldBeInCheck(row, col, m[0], m[1]));
}

function getPawnMoves(row, col, isWhite) {
    const moves = [];
    const direction = isWhite ? -1 : 1;
    const startRow = isWhite ? 6 : 1;

    if (row + direction >= 0 && row + direction < 8 && !board[row + direction][col]) {
        moves.push([row + direction, col]);

        if (row === startRow && !board[row + 2 * direction][col]) {
            moves.push([row + 2 * direction, col]);
        }
    }

    for (let dcol of [-1, 1]) {
        const newRow = row + direction;
        const newCol = col + dcol;
        if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
            const target = board[newRow][newCol];
            if (target && isWhitePiece(target) !== isWhite) {
                moves.push([newRow, newCol]);
            }

            if (enPassantTarget && newRow === enPassantTarget[0] && newCol === enPassantTarget[1]) {
                moves.push([newRow, newCol]);
            }
        }
    }

    return moves;
}

function getKnightMoves(row, col) {
    const moves = [];
    const piece = board[row][col];
    const isWhite = isWhitePiece(piece);
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

    for (let [dr, dc] of knightMoves) {
        const newRow = row + dr;
        const newCol = col + dc;
        if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
            const target = board[newRow][newCol];
            if (!target || isWhitePiece(target) !== isWhite) {
                moves.push([newRow, newCol]);
            }
        }
    }

    return moves;
}

function getLinearMoves(row, col, directions) {
    const moves = [];
    const piece = board[row][col];
    const isWhite = isWhitePiece(piece);

    for (let [dr, dc] of directions) {
        for (let i = 1; i < 8; i++) {
            const newRow = row + dr * i;
            const newCol = col + dc * i;

            if (newRow < 0 || newRow >= 8 || newCol < 0 || newCol >= 8) break;

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
    }

    return moves;
}

function getKingMoves(row, col) {
    const moves = [];
    const piece = board[row][col];
    const isWhite = isWhitePiece(piece);
    const color = isWhite ? 'white' : 'black';
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

    for (let [dr, dc] of kingMoves) {
        const newRow = row + dr;
        const newCol = col + dc;
        if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
            const target = board[newRow][newCol];
            if (!target || isWhitePiece(target) !== isWhite) {
                moves.push([newRow, newCol]);
            }
        }
    }

    if (canCastle(color, true)) {
        moves.push([row, col + 2]);
    }
    if (canCastle(color, false)) {
        moves.push([row, col - 2]);
    }

    return moves;
}

function getKingAttacks(row, col) {
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

    for (let [dr, dc] of kingMoves) {
        const newRow = row + dr;
        const newCol = col + dc;
        if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
            moves.push([newRow, newCol]);
        }
    }

    return moves;
}

function canCastle(color, kingside) {
    const rights = castlingRights[color];
    if (!rights[kingside ? 'kingside' : 'queenside']) {
        return false;
    }

    const row = color === 'white' ? 7 : 0;
    const kingCol = 4;
    const rookCol = kingside ? 7 : 0;
    const direction = kingside ? 1 : -1;

    if (isSquareAttacked(row, kingCol, color === 'white')) {
        return false;
    }

    for (let col = kingCol + direction; col !== rookCol; col += direction) {
        if (board[row][col]) {
            return false;
        }
    }

    for (let i = 0; i < 3; i++) {
        if (isSquareAttacked(row, kingCol + i * direction, color === 'white')) {
            return false;
        }
    }

    return true;
}

function wouldBeInCheck(fromRow, fromCol, toRow, toCol) {
    const piece = board[fromRow][fromCol];
    const isWhite = isWhitePiece(piece);
    const originalPiece = board[toRow][toCol];

    board[toRow][toCol] = piece;
    board[fromRow][fromCol] = null;

    let kingRow = fromRow;
    let kingCol = fromCol;

    if (piece.toLowerCase() === 'k') {
        kingRow = toRow;
        kingCol = toCol;
    } else {
        const kingPos = findKing(isWhite);
        if (kingPos) {
            kingRow = kingPos[0];
            kingCol = kingPos[1];
        }
    }

    const inCheck = isSquareAttacked(kingRow, kingCol, isWhite);

    board[fromRow][fromCol] = piece;
    board[toRow][toCol] = originalPiece;

    return inCheck;
}

function findKing(isWhite) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && piece.toLowerCase() === 'k' && isWhitePiece(piece) === isWhite) {
                return [r, c];
            }
        }
    }
    return null;
}

function isSquareAttacked(row, col, defendingIsWhite) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (!piece || isWhitePiece(piece) === defendingIsWhite) continue;

            const attacks = getPieceAttacks(r, c);
            if (attacks.some(m => m[0] === row && m[1] === col)) {
                return true;
            }
        }
    }
    return false;
}

function getPieceAttacks(row, col) {
    const piece = board[row][col];
    if (!piece) return [];

    const pieceType = piece.toLowerCase();
    const isWhite = isWhitePiece(piece);

    if (pieceType === 'p') {
        const attacks = [];
        const direction = isWhite ? -1 : 1;
        for (let dcol of [-1, 1]) {
            const newRow = row + direction;
            const newCol = col + dcol;
            if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
                attacks.push([newRow, newCol]);
            }
        }
        return attacks;
    } else if (pieceType === 'n') {
        return getKnightMoves(row, col);
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
        return getKingAttacks(row, col);
    }

    return [];
}

function flipBoard() {
    boardFlipped = !boardFlipped;
    createBoard();
}

function addMoveToHistory(piece, fromRow, fromCol, toRow, toCol, captured) {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const pieceType = piece.toUpperCase();
    const isPawn = pieceType === 'P';

    let notation = '';
    if (isPawn && captured) {
        notation = files[fromCol] + 'x' + files[toCol] + (8 - toRow);
    } else if (isPawn) {
        notation = files[toCol] + (8 - toRow);
    } else {
        const captureNotation = captured ? 'x' : '';
        notation = pieceType + captureNotation + files[toCol] + (8 - toRow);
    }

    const historyEl = document.getElementById('move-history');
    if (!historyEl) return;

    const moveNumber = Math.floor(moveHistory.length / 2) + 1;
    const isWhiteMove = moveHistory.length % 2 === 0;

    if (isWhiteMove) {
        const moveEl = document.createElement('div');
        moveEl.className = 'text-xs p-1 hover:bg-base-200 rounded flex';
        moveEl.id = `move-${moveNumber}`;
        moveEl.innerHTML = `
            <span class="w-8 font-semibold">${moveNumber}.</span>
            <span class="w-16">${notation}</span>
            <span class="w-16 text-base-content/50" id="move-${moveNumber}-black">...</span>
        `;
        historyEl.appendChild(moveEl);
    } else {
        const moveEl = document.getElementById(`move-${moveNumber}`);
        if (moveEl) {
            const blackSpan = document.getElementById(`move-${moveNumber}-black`);
            if (blackSpan) {
                blackSpan.textContent = notation;
                blackSpan.classList.remove('text-base-content/50');
            }
        }
    }

    historyEl.scrollTop = historyEl.scrollHeight;
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
