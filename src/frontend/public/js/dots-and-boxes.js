// Dots and Boxes Game with AI Integration
let gameSessionId = null;
let gridSize = 4;
let horizontalLines = {};
let verticalLines = {};
let boxes = {};
let currentPlayer = 'X';
let playerScore = 0;
let aiScore = 0;
let gameActive = false;
let currentUser = null;
let isProcessingMove = false;

const DOT_SIZE = 12;
const CELL_SIZE = 60;
const LINE_THICKNESS = 8;

// Cookie utility
function deleteCookie(name) {
    document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = name + '=; Path=/; Domain=localhost; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}

// Check authentication
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
    if (displayName) {
        displayName.textContent = user.displayName || user.username;
    }

    const initial = (user.displayName || user.username || 'U')[0].toUpperCase();
    const userInitial = document.getElementById('user-initial');
    if (userInitial) {
        userInitial.textContent = initial;
    }

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
    const quitGameBtn = document.getElementById('quit-game-btn');

    if (newGameBtn) {
        newGameBtn.addEventListener('click', startNewGame);
    }
    if (quitGameBtn) {
        quitGameBtn.addEventListener('click', quitGame);
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    startNewGame();
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
    if (!currentUser) {
        console.error('No user logged in');
        return;
    }

    // Reset state
    horizontalLines = {};
    verticalLines = {};
    boxes = {};
    currentPlayer = 'X';
    playerScore = 0;
    aiScore = 0;
    gameActive = false;
    gameSessionId = null;
    isProcessingMove = false;

    updateScores();
    updateGameStatus('Starting new game...');

    try {
        const response = await fetch('/api/game/dots-and-boxes/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
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
        gridSize = data.gridSize || 4;
        currentPlayer = data.currentPlayer || 'X';
        gameActive = true;

        drawBoard();
        updateGameStatus();
        console.log('Game started:', gameSessionId);
    } catch (error) {
        console.error('Error starting game:', error);
        updateGameStatus('Error starting game. Please try again.');
    }
}

function drawBoard() {
    const board = document.getElementById('game-board');
    board.innerHTML = '';

    const boardSize = (gridSize + 1) * DOT_SIZE + gridSize * CELL_SIZE;
    board.style.width = boardSize + 'px';
    board.style.height = boardSize + 'px';
    board.style.position = 'relative';

    // Draw dots
    for (let row = 0; row <= gridSize; row++) {
        for (let col = 0; col <= gridSize; col++) {
            const dot = document.createElement('div');
            dot.className = 'absolute bg-base-content rounded-full';
            dot.style.width = DOT_SIZE + 'px';
            dot.style.height = DOT_SIZE + 'px';
            dot.style.left = col * (CELL_SIZE + DOT_SIZE) + 'px';
            dot.style.top = row * (CELL_SIZE + DOT_SIZE) + 'px';
            board.appendChild(dot);
        }
    }

    // Draw horizontal line slots
    for (let row = 0; row <= gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            const line = document.createElement('div');
            line.className = 'absolute cursor-pointer bg-neutral/30 hover:bg-primary/30 transition-colors rounded';
            line.style.width = CELL_SIZE + 'px';
            line.style.height = LINE_THICKNESS + 'px';
            line.style.left = col * (CELL_SIZE + DOT_SIZE) + DOT_SIZE + 'px';
            line.style.top = row * (CELL_SIZE + DOT_SIZE) + DOT_SIZE / 2 - LINE_THICKNESS / 2 + 'px';
            line.dataset.type = 'horizontal';
            line.dataset.row = row;
            line.dataset.col = col;
            line.addEventListener('click', handleLineClick);
            board.appendChild(line);
        }
    }

    // Draw vertical line slots
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col <= gridSize; col++) {
            const line = document.createElement('div');
            line.className = 'absolute cursor-pointer bg-neutral/30 hover:bg-primary/30 transition-colors rounded';
            line.style.width = LINE_THICKNESS + 'px';
            line.style.height = CELL_SIZE + 'px';
            line.style.left = col * (CELL_SIZE + DOT_SIZE) + DOT_SIZE / 2 - LINE_THICKNESS / 2 + 'px';
            line.style.top = row * (CELL_SIZE + DOT_SIZE) + DOT_SIZE + 'px';
            line.dataset.type = 'vertical';
            line.dataset.row = row;
            line.dataset.col = col;
            line.addEventListener('click', handleLineClick);
            board.appendChild(line);
        }
    }

    // Draw box areas
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            const box = document.createElement('div');
            box.className = 'absolute flex items-center justify-center text-2xl font-bold';
            box.style.width = CELL_SIZE + 'px';
            box.style.height = CELL_SIZE + 'px';
            box.style.left = col * (CELL_SIZE + DOT_SIZE) + DOT_SIZE + 'px';
            box.style.top = row * (CELL_SIZE + DOT_SIZE) + DOT_SIZE + 'px';
            box.dataset.row = row;
            box.dataset.col = col;
            box.id = `box-${row}-${col}`;
            board.appendChild(box);
        }
    }
}

async function handleLineClick(event) {
    if (!gameActive || isProcessingMove || !gameSessionId || currentPlayer !== 'X') {
        return;
    }

    const line = event.currentTarget;
    const type = line.dataset.type;
    const row = parseInt(line.dataset.row);
    const col = parseInt(line.dataset.col);

    const key = `${row},${col}`;
    if (type === 'horizontal' && horizontalLines[key]) {
        return;
    }
    if (type === 'vertical' && verticalLines[key]) {
        return;
    }

    isProcessingMove = true;
    updateGameStatus('Making your move...');

    // Optimistically draw line
    drawLine(line, 'X');
    if (type === 'horizontal') {
        horizontalLines[key] = 'X';
    } else {
        verticalLines[key] = 'X';
    }

    try {
        const response = await fetch('/api/game/dots-and-boxes/move', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                gameSessionId: gameSessionId,
                move: {
                    type: type,
                    row: row,
                    col: col,
                },
                userId: currentUser.id,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to make move');
        }

        const data = await response.json();

        // Update from server state
        if (data.gameState) {
            updateFromServerState(data.gameState);
        }

        // Handle AI moves
        if (data.aiMoves && data.aiMoves.length > 0) {
            for (let i = 0; i < data.aiMoves.length; i++) {
                await new Promise(resolve => setTimeout(resolve, 500));
                const aiMove = data.aiMoves[i];
                const aiLine = document.querySelector(
                    `[data-type="${aiMove.type}"][data-row="${aiMove.row}"][data-col="${aiMove.col}"]`
                );
                if (aiLine) {
                    drawLine(aiLine, 'O');
                }
            }
            // Update state again after AI moves
            if (data.gameState) {
                updateFromServerState(data.gameState);
            }
        }

        // Check game over
        if (data.gameOver) {
            gameActive = false;
            handleGameEnd(data.winner);
        } else {
            updateGameStatus();
        }
    } catch (error) {
        console.error('Error making move:', error);
        updateGameStatus('Error making move. Try again.');
    } finally {
        isProcessingMove = false;
    }
}

function drawLine(lineElement, player) {
    lineElement.classList.remove('bg-neutral/30', 'hover:bg-primary/30', 'cursor-pointer');
    lineElement.classList.add(player === 'X' ? 'bg-success' : 'bg-error');
}

function updateFromServerState(state) {
    // Update lines
    horizontalLines = {};
    for (const [key, player] of Object.entries(state.horizontalLines)) {
        horizontalLines[key] = player;
        const [row, col] = key.split(',').map(Number);
        const line = document.querySelector(`[data-type="horizontal"][data-row="${row}"][data-col="${col}"]`);
        if (line && !line.classList.contains('bg-success') && !line.classList.contains('bg-error')) {
            drawLine(line, player);
        }
    }

    verticalLines = {};
    for (const [key, player] of Object.entries(state.verticalLines)) {
        verticalLines[key] = player;
        const [row, col] = key.split(',').map(Number);
        const line = document.querySelector(`[data-type="vertical"][data-row="${row}"][data-col="${col}"]`);
        if (line && !line.classList.contains('bg-success') && !line.classList.contains('bg-error')) {
            drawLine(line, player);
        }
    }

    // Update boxes
    boxes = {};
    for (const [key, player] of Object.entries(state.boxes)) {
        boxes[key] = player;
        const [row, col] = key.split(',').map(Number);
        const box = document.getElementById(`box-${row}-${col}`);
        if (box) {
            box.textContent = player;
            box.classList.add(player === 'X' ? 'text-success' : 'text-error');
            box.style.backgroundColor = player === 'X' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)';
        }
    }

    // Update scores and current player
    playerScore = state.playerScore;
    aiScore = state.aiScore;
    currentPlayer = state.currentPlayer;
    updateScores();
}

function updateScores() {
    const playerScoreEl = document.getElementById('player-score');
    const aiScoreEl = document.getElementById('ai-score');
    if (playerScoreEl) playerScoreEl.textContent = playerScore;
    if (aiScoreEl) aiScoreEl.textContent = aiScore;
}

function updateGameStatus(customMessage = null) {
    const statusElement = document.getElementById('game-status');
    if (!statusElement) return;

    if (customMessage) {
        statusElement.textContent = customMessage;
        statusElement.className = 'text-2xl font-bold text-primary';
        return;
    }

    if (!gameActive) {
        statusElement.textContent = 'Game Over';
        return;
    }

    const playerName = currentPlayer === 'X' ? 'Your' : "AI's";
    statusElement.textContent = `${playerName} Turn`;
    statusElement.className = 'text-2xl font-bold text-primary';
}

function handleGameEnd(winner) {
    let message, colorClass;

    if (winner === 'X') {
        message = '🎉 You Win!';
        colorClass = 'text-success';
    } else if (winner === 'O') {
        message = '🤖 AI Wins!';
        colorClass = 'text-error';
    } else {
        message = "🤝 It's a Draw!";
        colorClass = 'text-warning';
    }

    const statusElement = document.getElementById('game-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `text-2xl font-bold ${colorClass}`;
    }
}

function quitGame() {
    window.location.href = '/games';
}

function openLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.showModal();
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
});
