// Connect 4 Game
let currentUser = null;
let gameActive = false;
let gameStarted = false;
let board = [];
let gameSessionId = null;
let currentPlayer = 'player';
let aiThinking = false;
let winningLine = null;
let lastAnimatedPieces = new Set(); // Track which pieces have been animated

const ROWS = 6;
const COLS = 7;

// Initialize empty board
function initializeEmptyBoard() {
    board = [];
    for (let row = 0; row < ROWS; row++) {
        board[row] = [];
        for (let col = 0; col < COLS; col++) {
            board[row][col] = null;
        }
    }
}

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
            console.log('Not authenticated');
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
    const aiFirstBtn = document.getElementById('ai-first-btn');
    const quitGameBtn = document.getElementById('quit-game-btn');
    const logoutBtn = document.getElementById('logout-btn');

    if (newGameBtn) newGameBtn.addEventListener('click', startNewGame);
    if (aiFirstBtn) aiFirstBtn.addEventListener('click', handleAIFirstMove);
    if (quitGameBtn) quitGameBtn.addEventListener('click', quitGame);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    createBoard();
    updateGameStatus();
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

async function startNewGame() {
    try {
        const response = await fetch('/api/game/connect4/start', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                difficulty: 'medium',
                playerStarts: true,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to start game');
        }

        const data = await response.json();
        gameSessionId = data.gameSessionId;
        board = data.boardState;
        currentPlayer = data.currentPlayer;
        gameActive = data.gameActive;
        gameStarted = true;
        aiThinking = false;
        winningLine = null;

        // Show AI first move button
        const aiFirstBtn = document.getElementById('ai-first-btn');
        if (aiFirstBtn) {
            aiFirstBtn.classList.remove('hidden');
        }

        createBoard();
        updateGameStatus();
    } catch (error) {
        console.error('Error starting game:', error);
        alert('Failed to start game. Please try again.');
    }
}

async function handleAIFirstMove() {
    if (!gameSessionId || !gameActive || aiThinking) return;

    aiThinking = true;
    updateGameStatus('AI is thinking...');

    try {
        const response = await fetch('/api/game/connect4/ai-first', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gameSessionId: gameSessionId,
                userId: currentUser.id,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to make AI move');
        }

        const data = await response.json();
        board = data.boardState;
        currentPlayer = data.currentPlayer;

        // Hide AI first button after use
        const aiFirstBtn = document.getElementById('ai-first-btn');
        if (aiFirstBtn) {
            aiFirstBtn.classList.add('hidden');
        }

        createBoard();
        updateGameStatus();
    } catch (error) {
        console.error('Error with AI first move:', error);
        alert(error.message || 'AI could not make first move. Please try again.');
    } finally {
        aiThinking = false;
        updateGameStatus();
    }
}

async function handleColumnClick(col) {
    if (!gameActive || !gameStarted || currentPlayer !== 'player' || aiThinking) return;

    // Check if board is initialized and column is valid
    if (!board || !board[0] || board[0][col] === undefined) {
        console.error('Board not properly initialized');
        return;
    }

    // Check if column is full
    if (board[0][col] !== null) {
        return;
    }

    aiThinking = true;
    updateGameStatus('Your turn...');

    // Hide AI first button once player makes first move
    const aiFirstBtn = document.getElementById('ai-first-btn');
    if (aiFirstBtn) {
        aiFirstBtn.classList.add('hidden');
    }

    // Find where the piece will land (optimistically)
    let landingRow = ROWS - 1;
    for (let row = ROWS - 1; row >= 0; row--) {
        if (board[row][col] === null) {
            landingRow = row;
            break;
        }
    }

    // Update board locally to show player's piece
    const previousBoard = board.map(row => [...row]); // Deep copy
    board[landingRow][col] = 'player';

    // Render with animation for player's piece
    createBoard(landingRow, col);

    // Wait for player's piece animation to complete
    await new Promise(resolve => setTimeout(resolve, 400));

    try {
        // NOW make the API call after animation
        const response = await fetch('/api/game/connect4/move', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gameSessionId: gameSessionId,
                userId: currentUser.id,
                move: { col: col },
            }),
        });

        if (!response.ok) {
            // Revert the optimistic update
            board = previousBoard;
            createBoard();
            const error = await response.json();
            throw new Error(error.detail || 'Invalid move');
        }

        const data = await response.json();

        // Update board with server state
        board = data.boardState;

        // Check for player win
        if (data.gameOver && data.winner === 'player') {
            gameActive = false;
            aiThinking = false;
            winningLine = data.winningLine;
            createBoard(); // Redraw to show winning line
            updateGameStatus('You win! 🎉');
            return;
        }

        // Check for draw
        if (data.gameOver && data.winner === 'draw') {
            gameActive = false;
            aiThinking = false;
            createBoard();
            updateGameStatus("It's a draw!");
            return;
        }

        // Show AI's move if there is one
        if (data.aiMove) {
            updateGameStatus("AI's turn...");

            // Redraw board with AI piece animated
            createBoard(data.aiMove.row, data.aiMove.col);

            // Wait for AI animation
            await new Promise(resolve => setTimeout(resolve, 400));

            // Check for AI win
            if (data.gameOver && data.winner === 'ai') {
                gameActive = false;
                aiThinking = false;
                winningLine = data.winningLine;
                createBoard(); // Redraw to show winning line
                updateGameStatus('AI wins!');
                return;
            }
        }

        // Game continues
        currentPlayer = data.currentPlayer;
        gameActive = data.gameActive;
        winningLine = data.winningLine;
        aiThinking = false;

        // Redraw board one final time to enable clicks (no animation)
        createBoard();
        updateGameStatus();
    } catch (error) {
        console.error('Move error:', error);
        alert(error.message || 'Invalid move. Please try again.');
        board = previousBoard;
        aiThinking = false;
        createBoard();
    }
}

// Helper to find which row a piece landed in a column (before AI move)
function findLastPieceInColumn(boardState, col) {
    for (let row = ROWS - 1; row >= 0; row--) {
        if (boardState[row][col] !== null) {
            return row;
        }
    }
    return ROWS - 1;
}

// Helper to find player's piece row (different from AI's)
function findPieceRow(boardState, playerCol, aiCol) {
    for (let row = ROWS - 1; row >= 0; row--) {
        if (boardState[row][playerCol] === 'player') {
            return row;
        }
    }
    return ROWS - 1;
}

function createBoard(animateRow = null, animateCol = null) {
    const boardEl = document.getElementById('connect4-board');
    if (!boardEl) return;

    // Ensure board is initialized
    if (!board || board.length === 0) {
        initializeEmptyBoard();
    }

    boardEl.innerHTML = '';

    // Create column hover indicators (one per column at the top)
    if (gameActive && currentPlayer === 'player' && !aiThinking) {
        for (let col = 0; col < COLS; col++) {
            if (board[0][col] === null) {
                const colHover = document.createElement('div');
                colHover.className = 'column-hover-indicator';
                // Calculate position: padding (20px) + col * (cell width 70px + gap 8px)
                colHover.style.left = 20 + col * 78 + 'px';
                colHover.style.top = '-35px';
                colHover.style.position = 'absolute';
                colHover.style.width = '70px';
                colHover.style.height = '50px';
                colHover.style.display = 'flex';
                colHover.style.alignItems = 'center';
                colHover.style.justifyContent = 'center';
                colHover.style.opacity = '0';
                colHover.style.transition = 'opacity 0.2s';
                colHover.style.pointerEvents = 'none';
                colHover.dataset.col = col;

                const hoverPiece = document.createElement('div');
                hoverPiece.style.width = '50px';
                hoverPiece.style.height = '50px';
                hoverPiece.style.borderRadius = '50%';
                hoverPiece.style.background = 'radial-gradient(circle at 30% 30%, #fbbf24, #f59e0b)';
                hoverPiece.style.opacity = '0.7';
                colHover.appendChild(hoverPiece);

                boardEl.appendChild(colHover);
            }
        }
    }

    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const cell = document.createElement('div');
            cell.className = 'connect4-cell';
            cell.dataset.row = row;
            cell.dataset.col = col;

            // Add hover effect for entire column
            if (gameActive && !aiThinking && currentPlayer === 'player' && board[0][col] === null) {
                cell.addEventListener('mouseenter', () => {
                    const indicator = boardEl.querySelector(`.column-hover-indicator[data-col="${col}"]`);
                    if (indicator) indicator.style.opacity = '1';
                });
                cell.addEventListener('mouseleave', () => {
                    const indicator = boardEl.querySelector(`.column-hover-indicator[data-col="${col}"]`);
                    if (indicator) indicator.style.opacity = '0';
                });
                cell.addEventListener('click', () => handleColumnClick(col));
            } else {
                cell.classList.add('disabled');
            }

            // Add piece if present
            const piece = board[row][col];
            if (piece) {
                const pieceEl = document.createElement('div');
                pieceEl.className = `connect4-piece ${piece}`;

                // Only animate if this is the specified piece to animate
                const shouldAnimate = animateRow === row && animateCol === col;
                if (!shouldAnimate) {
                    // Remove animation for already-placed pieces
                    pieceEl.style.animation = 'none';
                }

                // Highlight winning pieces
                if (winningLine && winningLine.some(p => p.row === row && p.col === col)) {
                    pieceEl.classList.add('winning');
                }

                cell.appendChild(pieceEl);
            }

            boardEl.appendChild(cell);
        }
    }
}

function updateGameStatus(customMessage = null) {
    const turnEl = document.getElementById('current-turn');

    if (customMessage) {
        if (turnEl) turnEl.textContent = customMessage;
        return;
    }

    if (!gameStarted) {
        if (turnEl) turnEl.textContent = 'Click "New Game" to start';
        return;
    }

    if (!gameActive) {
        return;
    }

    if (currentPlayer === 'player') {
        if (turnEl) turnEl.textContent = 'Your Turn - Click a column';
    } else {
        if (turnEl) turnEl.textContent = 'AI is thinking...';
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
