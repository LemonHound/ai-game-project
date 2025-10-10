// Tic-Tac-Toe Game with AI Integration
let gameSessionId = null;
let gameBoard = ['', '', '', '', '', '', '', '', ''];
let currentPlayer = 'X';
let gameActive = false;
let currentUser = null;
let isProcessingMove = false;

// Cookie utility function
function deleteCookie(name) {
    document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = name + '=; Path=/; Domain=localhost; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}

// Check authentication status
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

// Update UI for authenticated user
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

// Show auth gate
function showAuthGate() {
    const authGate = document.getElementById('auth-gate');
    const gameContainer = document.getElementById('game-container');

    if (authGate) authGate.classList.remove('hidden');
    if (gameContainer) gameContainer.classList.add('hidden');
}

// Show game container
function showGameContainer() {
    const authGate = document.getElementById('auth-gate');
    const gameContainer = document.getElementById('game-container');

    if (authGate) authGate.classList.add('hidden');
    if (gameContainer) gameContainer.classList.remove('hidden');
}

// Initialize game
function initializeGame() {
    const cells = document.querySelectorAll('.game-cell');
    const newGameBtn = document.getElementById('new-game-btn');
    const quitGameBtn = document.getElementById('quit-game-btn');

    // Add click handlers to cells
    cells.forEach(cell => {
        cell.addEventListener('click', handleCellClick);
    });

    // Add button handlers
    if (newGameBtn) {
        newGameBtn.addEventListener('click', startNewGame);
    }
    if (quitGameBtn) {
        quitGameBtn.addEventListener('click', quitGame);
    }

    // Setup logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Start first game
    startNewGame();
}

// Handle logout
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

// Start new game with backend
async function startNewGame() {
    if (!currentUser) {
        console.error('No user logged in');
        return;
    }

    // Reset local state
    gameBoard = [null, null, null, null, null, null, null, null, null];
    currentPlayer = 'X';
    gameActive = false;
    gameSessionId = null;
    isProcessingMove = false;

    // Clear cells visually
    const cells = document.querySelectorAll('.game-cell');
    cells.forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('btn-success', 'btn-error');
        cell.classList.add('btn-neutral');
    });

    updateGameStatus('Starting new game...');

    try {
        const response = await fetch('/api/game/tic-tac-toe/start', {
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
        gameBoard = data.board || [null, null, null, null, null, null, null, null, null];
        currentPlayer = data.currentPlayer || 'X';
        gameActive = true;

        updateGameStatus();
        console.log('Game started:', gameSessionId);
    } catch (error) {
        console.error('Error starting game:', error);
        updateGameStatus('Error starting game. Please try again.');
    }
}

// Handle cell click
async function handleCellClick(event) {
    const cell = event.target;
    const cellIndex = parseInt(cell.getAttribute('data-cell'));

    // Validation checks
    if (!gameActive || isProcessingMove || !gameSessionId) {
        return;
    }

    if (currentPlayer !== 'X') {
        return;
    }

    if (gameBoard[cellIndex] !== null) {
        return;
    }

    // Make player move
    isProcessingMove = true;
    updateGameStatus('Making your move...');

    // Optimistically update UI
    makeLocalMove(cellIndex, 'X');

    try {
        const response = await fetch('/api/game/tic-tac-toe/move', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                gameSessionId: gameSessionId,
                move: cellIndex,
                userId: currentUser.id,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to make move');
        }

        const data = await response.json();

        // Update game state from server
        if (data.gameState) {
            gameBoard = data.gameState.board;
            currentPlayer = data.gameState.currentPlayer;

            // Update board display
            updateBoardFromState(data.gameState.board);
        }

        // Handle AI move
        if (data.aiMove && data.aiMove.position !== undefined) {
            setTimeout(() => {
                makeLocalMove(data.aiMove.position, 'O');
            }, 300); // Small delay for better UX
        }

        // Check if game is over
        if (data.gameOver) {
            gameActive = false;
            handleGameEnd(data.winner);
        } else {
            updateGameStatus();
        }
    } catch (error) {
        console.error('Error making move:', error);
        // Revert optimistic update on error
        gameBoard[cellIndex] = null;
        cell.textContent = '';
        cell.classList.remove('btn-success');
        cell.classList.add('btn-neutral');
        updateGameStatus('Error making move. Try again.');
    } finally {
        isProcessingMove = false;
    }
}

// Make a local move (update UI)
function makeLocalMove(cellIndex, player) {
    gameBoard[cellIndex] = player;
    const cell = document.querySelector(`[data-cell="${cellIndex}"]`);
    if (cell) {
        cell.textContent = player;
        cell.classList.remove('btn-neutral');
        cell.classList.add(player === 'X' ? 'btn-success' : 'btn-error');
    }
}

// Update board from server state
function updateBoardFromState(board) {
    board.forEach((cell, index) => {
        if (cell !== null && cell !== gameBoard[index]) {
            makeLocalMove(index, cell);
        }
    });
}

// Handle game end
function handleGameEnd(winner) {
    let message, colorClass, statsType;

    if (winner === 'X') {
        message = '🎉 You Win!';
        colorClass = 'text-success';
        statsType = 'wins';
    } else if (winner === 'O') {
        message = '🤖 AI Wins!';
        colorClass = 'text-error';
        statsType = 'losses';
    } else {
        message = "🤝 It's a Draw!";
        colorClass = 'text-warning';
        statsType = 'draws';
    }

    endGame(message, colorClass);
    updateStats(statsType);
}

// Update game status display
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
    statusElement.textContent = `${playerName} Turn (${currentPlayer})`;
    statusElement.className = 'text-2xl font-bold text-primary';
}

// End game
function endGame(message, colorClass) {
    gameActive = false;
    const statusElement = document.getElementById('game-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `text-2xl font-bold ${colorClass}`;
    }
}

// Update game statistics
function updateStats(type) {
    const countElement = document.getElementById(`${type}-count`);
    if (countElement) {
        const currentCount = parseInt(countElement.textContent);
        countElement.textContent = currentCount + 1;
    }
}

// Quit game and return to games page
function quitGame() {
    window.location.href = '/games';
}

// Open login modal (for auth gate)
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
