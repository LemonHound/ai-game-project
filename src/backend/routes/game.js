const express = require('express');
const router = express.Router();
const pool = require('../../shared/database/connection');

// Mock game states storage (in production, use database)
const gameStates = new Map();

// Get all available games
router.get('/', async (req, res) => {
    try {
        // This could come from database in the future
        const games = [
            {
                id: 'tic-tac-toe',
                name: 'Tic Tac Toe',
                description: 'Classic game with adaptive AI opponent',
                icon: '⭕',
                difficulty: 'Easy',
                players: 1,
                status: 'active',
                category: 'strategy'
            },
            {
                id: 'snake',
                name: 'Snake AI',
                description: 'Snake game with predictive AI assistance',
                icon: '🐍',
                difficulty: 'Medium',
                players: 1,
                status: 'active',
                category: 'arcade'
            },
            {
                id: 'puzzle',
                name: 'AI Puzzle',
                description: 'Dynamic puzzles that adapt to your skill',
                icon: '🧩',
                difficulty: 'Hard',
                players: 1,
                status: 'active',
                category: 'puzzle'
            },
            {
                id: 'chess',
                name: 'Chess',
                description: 'Chess with AI that learns your style',
                icon: '♟️',
                difficulty: 'Expert',
                players: 1,
                status: 'coming-soon',
                category: 'strategy'
            },
            {
                id: 'trivia',
                name: 'Smart Trivia',
                description: 'Trivia questions tailored to your knowledge',
                icon: '🧠',
                difficulty: 'Variable',
                players: 1,
                status: 'coming-soon',
                category: 'knowledge'
            }
        ];

        res.json(games);
    } catch (error) {
        console.error('Games list error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get specific game info
router.get('/:gameId', async (req, res) => {
    try {
        const { gameId } = req.params;

        // Mock game data - in production, fetch from database
        const gameInfo = {
            'tic-tac-toe': {
                id: 'tic-tac-toe',
                name: 'Tic Tac Toe',
                description: 'Classic 3x3 grid game with AI opponent',
                rules: 'Get three in a row to win!',
                difficulty: 'Easy',
                estimatedTime: '2-5 minutes'
            },
            'snake': {
                id: 'snake',
                name: 'Snake AI',
                description: 'Navigate the snake to eat food and grow',
                rules: 'Avoid walls and your own tail!',
                difficulty: 'Medium',
                estimatedTime: '5-10 minutes'
            }
        };

        const game = gameInfo[gameId];
        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        res.json(game);
    } catch (error) {
        console.error('Game info error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start a new game
router.post('/:gameId/start', async (req, res) => {
    try {
        const { gameId } = req.params;
        const sessionId = req.headers['x-session-id'];

        // Generate game session ID
        const gameSessionId = `${gameId}_${Date.now()}_${Math.random().toString(36).substring(2)}`;

        // Initialize game state based on game type
        let initialState;
        switch (gameId) {
            case 'tic-tac-toe':
                initialState = {
                    board: Array(9).fill(null),
                    currentPlayer: 'X',
                    winner: null,
                    gameOver: false
                };
                break;
            case 'snake':
                initialState = {
                    snake: [{ x: 10, y: 10 }],
                    food: { x: 15, y: 15 },
                    direction: 'right',
                    score: 0,
                    gameOver: false
                };
                break;
            default:
                return res.status(400).json({ error: 'Unsupported game type' });
        }

        // Store game state
        gameStates.set(gameSessionId, {
            gameId,
            sessionId,
            state: initialState,
            createdAt: new Date(),
            lastMove: new Date()
        });

        res.json({
            gameSessionId,
            gameId,
            state: initialState,
            message: 'Game started successfully'
        });

    } catch (error) {
        console.error('Game start error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get game state
router.get('/:gameId/state/:gameSessionId', async (req, res) => {
    try {
        const { gameSessionId } = req.params;

        const gameData = gameStates.get(gameSessionId);
        if (!gameData) {
            return res.status(404).json({ error: 'Game session not found' });
        }

        res.json({
            gameSessionId,
            gameId: gameData.gameId,
            state: gameData.state,
            lastMove: gameData.lastMove
        });

    } catch (error) {
        console.error('Game state error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Make a move
router.post('/:gameId/move/:gameSessionId', async (req, res) => {
    try {
        const { gameId, gameSessionId } = req.params;
        const { move } = req.body;

        const gameData = gameStates.get(gameSessionId);
        if (!gameData) {
            return res.status(404).json({ error: 'Game session not found' });
        }

        // Process move based on game type
        let newState;
        let isValid = true;

        switch (gameId) {
            case 'tic-tac-toe':
                newState = processTicTacToeMove(gameData.state, move);
                break;
            case 'snake':
                newState = processSnakeMove(gameData.state, move);
                break;
            default:
                return res.status(400).json({ error: 'Unsupported game type' });
        }

        if (!isValid) {
            return res.status(400).json({ error: 'Invalid move' });
        }

        // Update stored state
        gameData.state = newState;
        gameData.lastMove = new Date();
        gameStates.set(gameSessionId, gameData);

        res.json({
            gameSessionId,
            state: newState,
            isValid: true
        });

    } catch (error) {
        console.error('Move processing error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get leaderboard for a game
router.get('/:gameId/leaderboard', async (req, res) => {
    try {
        const { gameId } = req.params;

        // Mock leaderboard data
        const leaderboards = {
            'tic-tac-toe': [
                { rank: 1, player: 'AI Master', score: 985, games: 100 },
                { rank: 2, player: 'Strategy Pro', score: 892, games: 85 },
                { rank: 3, player: 'Demo Player', score: 745, games: 67 }
            ],
            'snake': [
                { rank: 1, player: 'Snake Charmer', score: 1250, games: 45 },
                { rank: 2, player: 'Speed Demon', score: 1100, games: 38 },
                { rank: 3, player: 'Pixel Hunter', score: 950, games: 29 }
            ]
        };

        const leaderboard = leaderboards[gameId] || [];
        res.json(leaderboard);

    } catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper functions for game logic
function processTicTacToeMove(currentState, move) {
    const { position } = move;
    const newState = JSON.parse(JSON.stringify(currentState));

    // Validate move
    if (newState.board[position] !== null || newState.gameOver) {
        throw new Error('Invalid move');
    }

    // Make move
    newState.board[position] = newState.currentPlayer;

    // Check for winner
    const winner = checkTicTacToeWinner(newState.board);
    if (winner) {
        newState.winner = winner;
        newState.gameOver = true;
    } else if (newState.board.every(cell => cell !== null)) {
        newState.winner = 'tie';
        newState.gameOver = true;
    } else {
        // Switch players
        newState.currentPlayer = newState.currentPlayer === 'X' ? 'O' : 'X';
    }

    return newState;
}

function checkTicTacToeWinner(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
        [0, 4, 8], [2, 4, 6] // diagonals
    ];

    for (let line of lines) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }

    return null;
}

function processSnakeMove(currentState, move) {
    const { direction } = move;
    const newState = JSON.parse(JSON.stringify(currentState));

    // Update direction
    newState.direction = direction;

    // Move snake
    const head = { ...newState.snake[0] };
    switch (direction) {
        case 'up': head.y -= 1; break;
        case 'down': head.y += 1; break;
        case 'left': head.x -= 1; break;
        case 'right': head.x += 1; break;
    }

    newState.snake.unshift(head);

    // Check if food eaten
    if (head.x === newState.food.x && head.y === newState.food.y) {
        newState.score += 10;
        // Generate new food position
        newState.food = {
            x: Math.floor(Math.random() * 20),
            y: Math.floor(Math.random() * 20)
        };
    } else {
        newState.snake.pop();
    }

    // Check game over conditions
    if (head.x < 0 || head.x >= 20 || head.y < 0 || head.y >= 20 ||
        newState.snake.slice(1).some(segment => segment.x === head.x && segment.y === head.y)) {
        newState.gameOver = true;
    }

    return newState;
}

module.exports = router;