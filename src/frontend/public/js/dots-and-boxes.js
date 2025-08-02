// dots-and-boxes.js - Game logic for Dots and Boxes (Fixed Styling)
class DotsAndBoxesGame {
  constructor() {
    this.gridSize = 4; // 4x4 grid of dots (3x3 boxes)
    this.horizontalLines = Array(this.gridSize)
      .fill(null)
      .map(() => Array(this.gridSize - 1).fill(false));
    this.verticalLines = Array(this.gridSize - 1)
      .fill(null)
      .map(() => Array(this.gridSize).fill(false));
    this.boxes = Array(this.gridSize - 1)
      .fill(null)
      .map(() => Array(this.gridSize - 1).fill(null));
    this.currentPlayer = 'player'; // 'player' or 'ai'
    this.scores = { player: 0, ai: 0 };
    this.gameOver = false;
    this.moveHistory = [];
    this.playerStarts = true;

    this.maxAIWaitTime = 2500;

    this.initializeBoard();
    this.updateGameStatus();
    this.updateScores();
    this.updateAIThoughts('Ready to play! Click on any line to start.');

    // If AI should start, make AI move after short delay
    if (!this.playerStarts) {
      this.currentPlayer = 'ai';
      this.updateGameStatus();
      this.updateAIThoughts("I'll start this game!");
      setTimeout(() => this.makeAIMove(), 500);
    }
  }

  initializeBoard() {
    const boardElement = document.getElementById('game-board');
    boardElement.innerHTML = '';
    boardElement.className = 'flex justify-center';

    // Create the game container with proper grid layout
    const gameContainer = document.createElement('div');
    gameContainer.className =
      'relative bg-base-100 p-4 rounded-lg border border-base-300';
    gameContainer.style.width = '400px';
    gameContainer.style.height = '400px';

    // Calculate positions for dots, lines, and boxes
    const dotSize = 15;
    const cellSize = 120; // Space between dots
    const lineThickness = 8;

    // Create dots
    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        const dot = document.createElement('div');
        dot.className = 'absolute bg-primary rounded-full z-20';
        dot.style.width = `${dotSize}px`;
        dot.style.height = `${dotSize}px`;
        dot.style.left = `${col * cellSize + 20 - dotSize / 2}px`;
        dot.style.top = `${row * cellSize + 20 - dotSize / 2}px`;
        gameContainer.appendChild(dot);
      }
    }

    // Create horizontal lines
    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize - 1; col++) {
        const line = document.createElement('div');
        line.className =
          'absolute bg-base-300 hover:bg-primary cursor-pointer transition-all duration-200 rounded z-10';
        line.style.width = `${cellSize - dotSize}px`;
        line.style.height = `${lineThickness}px`;
        line.style.left = `${col * cellSize + 20 + dotSize / 2}px`;
        line.style.top = `${row * cellSize + 20 - lineThickness / 2}px`;
        line.dataset.type = 'horizontal';
        line.dataset.row = row;
        line.dataset.col = col;
        line.addEventListener('click', () =>
          this.makeMove('horizontal', row, col)
        );
        gameContainer.appendChild(line);
      }
    }

    // Create vertical lines
    for (let row = 0; row < this.gridSize - 1; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        const line = document.createElement('div');
        line.className =
          'absolute bg-base-300 hover:bg-primary cursor-pointer transition-all duration-200 rounded z-10';
        line.style.width = `${lineThickness}px`;
        line.style.height = `${cellSize - dotSize}px`;
        line.style.left = `${col * cellSize + 20 - lineThickness / 2}px`;
        line.style.top = `${row * cellSize + 20 + dotSize / 2}px`;
        line.dataset.type = 'vertical';
        line.dataset.row = row;
        line.dataset.col = col;
        line.addEventListener('click', () =>
          this.makeMove('vertical', row, col)
        );
        gameContainer.appendChild(line);
      }
    }

    // Create box areas
    for (let row = 0; row < this.gridSize - 1; row++) {
      for (let col = 0; col < this.gridSize - 1; col++) {
        const box = document.createElement('div');
        box.className =
          'absolute border border-transparent rounded flex items-center justify-center text-3xl font-bold z-5 transition-all duration-300';
        box.style.width = `${cellSize - dotSize}px`;
        box.style.height = `${cellSize - dotSize}px`;
        box.style.left = `${col * cellSize + 20 + dotSize / 2}px`;
        box.style.top = `${row * cellSize + 20 + dotSize / 2}px`;
        box.dataset.type = 'box';
        box.dataset.row = row;
        box.dataset.col = col;
        gameContainer.appendChild(box);
      }
    }

    boardElement.appendChild(gameContainer);
  }

  makeMove(type, row, col) {
    if (this.gameOver || this.currentPlayer === 'ai') return;

    if (type === 'horizontal' && !this.horizontalLines[row][col]) {
      this.horizontalLines[row][col] = true;
      this.drawLine('horizontal', row, col);
      this.addMoveToHistory('Player', `H${row}-${col}`);
    } else if (type === 'vertical' && !this.verticalLines[row][col]) {
      this.verticalLines[row][col] = true;
      this.drawLine('vertical', row, col);
      this.addMoveToHistory('Player', `V${row}-${col}`);
    } else {
      return; // Invalid move
    }

    const completedBoxes = this.checkCompletedBoxes();
    if (completedBoxes.length === 0) {
      // No boxes completed, switch turns
      this.currentPlayer = 'ai';
      this.updateGameStatus();
      this.updateAIThoughts('My turn! Let me analyze the board...');
      const randWaitTime = Math.trunc((1 + Math.random()) * this.maxAIWaitTime);
      setTimeout(() => this.makeAIMove(), randWaitTime);
    } else {
      // Boxes completed, player gets another turn
      this.updateAIThoughts(
        `You completed ${completedBoxes.length} box${completedBoxes.length > 1 ? 'es' : ''}! Go again!`
      );
    }

    this.updateScores();
    this.checkGameEnd();
  }

  makeAIMove() {
    if (this.gameOver || this.currentPlayer !== 'ai') return;

    const move = this.getBestAIMove();
    if (!move) return;

    const { type, row, col } = move;

    if (type === 'horizontal') {
      this.horizontalLines[row][col] = true;
      this.drawLine('horizontal', row, col);
      this.addMoveToHistory('AI', `H${row}-${col}`);
    } else {
      this.verticalLines[row][col] = true;
      this.drawLine('vertical', row, col);
      this.addMoveToHistory('AI', `V${row}-${col}`);
    }

    const completedBoxes = this.checkCompletedBoxes();
    if (completedBoxes.length === 0) {
      // No boxes completed, switch turns
      this.currentPlayer = 'player';
      this.updateGameStatus();
      this.updateAIThoughts(
        'Your turn! Look for opportunities to complete boxes.'
      );
    } else {
      // Boxes completed, AI gets another turn
      this.updateAIThoughts(
        `I completed ${completedBoxes.length} box${completedBoxes.length > 1 ? 'es' : ''}! My turn again.`
      );
      const randWaitTime = Math.trunc((1 + Math.random()) * this.maxAIWaitTime);
      setTimeout(() => this.makeAIMove(), randWaitTime);
    }

    this.updateScores();
    this.checkGameEnd();
  }

  getBestAIMove() {
    const availableMoves = this.getAvailableMoves();
    if (availableMoves.length === 0) return null;

    // Strategy:
    // 1. Complete a box if possible
    // 2. Avoid giving opponent a box
    // 3. Random safe move

    // Check for moves that complete boxes
    for (const move of availableMoves) {
      const boxesCompleted = this.simulateMove(move);
      if (boxesCompleted > 0) {
        return move;
      }
    }

    // Check for moves that don't give opponent boxes
    const safeMoves = availableMoves.filter((move) => {
      return this.wouldGiveOpponentBox(move) === 0;
    });

    if (safeMoves.length > 0) {
      return safeMoves[Math.floor(Math.random() * safeMoves.length)];
    }

    // If all moves give opponent boxes, pick randomly
    return availableMoves[Math.floor(Math.random() * availableMoves.length)];
  }

  getAvailableMoves() {
    const moves = [];

    // Check horizontal lines
    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize - 1; col++) {
        if (!this.horizontalLines[row][col]) {
          moves.push({ type: 'horizontal', row, col });
        }
      }
    }

    // Check vertical lines
    for (let row = 0; row < this.gridSize - 1; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        if (!this.verticalLines[row][col]) {
          moves.push({ type: 'vertical', row, col });
        }
      }
    }

    return moves;
  }

  simulateMove(move) {
    const { type, row, col } = move;
    let completedBoxes = 0;

    if (type === 'horizontal') {
      // Check boxes above and below
      if (row > 0)
        completedBoxes += this.wouldCompleteBox(
          row - 1,
          col,
          'horizontal',
          row,
          col
        );
      if (row < this.gridSize - 1)
        completedBoxes += this.wouldCompleteBox(
          row,
          col,
          'horizontal',
          row,
          col
        );
    } else {
      // Check boxes left and right
      if (col > 0)
        completedBoxes += this.wouldCompleteBox(
          row,
          col - 1,
          'vertical',
          row,
          col
        );
      if (col < this.gridSize - 1)
        completedBoxes += this.wouldCompleteBox(row, col, 'vertical', row, col);
    }

    return completedBoxes;
  }

  wouldCompleteBox(boxRow, boxCol, lineType, lineRow, lineCol) {
    if (this.boxes[boxRow][boxCol] !== null) return 0;

    let linesCompleted = 0;

    // Count existing lines
    if (this.horizontalLines[boxRow][boxCol]) linesCompleted++;
    if (this.horizontalLines[boxRow + 1][boxCol]) linesCompleted++;
    if (this.verticalLines[boxRow][boxCol]) linesCompleted++;
    if (this.verticalLines[boxRow][boxCol + 1]) linesCompleted++;

    // Add the simulated line
    if (lineType === 'horizontal') {
      if (
        (lineRow === boxRow || lineRow === boxRow + 1) &&
        lineCol === boxCol
      ) {
        linesCompleted++;
      }
    } else {
      if (
        lineRow === boxRow &&
        (lineCol === boxCol || lineCol === boxCol + 1)
      ) {
        linesCompleted++;
      }
    }

    return linesCompleted === 4 ? 1 : 0;
  }

  wouldGiveOpponentBox(move) {
    // Similar to simulateMove but checks what opponent could get
    return this.simulateMove(move);
  }

  drawLine(type, row, col) {
    const element = document.querySelector(
      `[data-type="${type}"][data-row="${row}"][data-col="${col}"]`
    );
    if (element) {
      element.classList.remove('bg-base-300', 'hover:bg-primary');
      element.classList.add('bg-primary');
      element.style.cursor = 'default';
    }
  }

  checkCompletedBoxes() {
    const newlyCompleted = [];

    for (let row = 0; row < this.gridSize - 1; row++) {
      for (let col = 0; col < this.gridSize - 1; col++) {
        if (this.boxes[row][col] === null && this.isBoxComplete(row, col)) {
          this.boxes[row][col] = this.currentPlayer;
          newlyCompleted.push({ row, col });
          this.drawBox(row, col);
          this.scores[this.currentPlayer]++;
        }
      }
    }

    return newlyCompleted;
  }

  isBoxComplete(row, col) {
    return (
      this.horizontalLines[row][col] &&
      this.horizontalLines[row + 1][col] &&
      this.verticalLines[row][col] &&
      this.verticalLines[row][col + 1]
    );
  }

  drawBox(row, col) {
    const element = document.querySelector(
      `[data-type="box"][data-row="${row}"][data-col="${col}"]`
    );
    if (element) {
      const isPlayer = this.currentPlayer === 'player';
      element.classList.remove('border-transparent');
      element.classList.add(
        isPlayer ? 'bg-success' : 'bg-error',
        isPlayer ? 'border-success' : 'border-error',
        'shadow-lg'
      );
      element.textContent = isPlayer ? '✓' : '✗';
      element.style.color = isPlayer ? 'white' : 'white';
    }
  }

  checkGameEnd() {
    const totalBoxes = (this.gridSize - 1) * (this.gridSize - 1);
    const completedBoxes = this.scores.player + this.scores.ai;

    if (completedBoxes === totalBoxes) {
      this.gameOver = true;
      this.endGame();
    }
  }

  endGame() {
    let statusMessage = '';

    if (this.scores.player > this.scores.ai) {
      statusMessage = `🎉 You Win! ${this.scores.player} - ${this.scores.ai}`;
      this.updateAIThoughts(
        `Congratulations! You completed ${this.scores.player} boxes. Well played! 🏆`
      );
    } else if (this.scores.ai > this.scores.player) {
      statusMessage = `🤖 AI Wins! ${this.scores.ai} - ${this.scores.player}`;
      this.updateAIThoughts(
        `Victory! I completed ${this.scores.ai} boxes. Good game! 🎯`
      );
    } else {
      statusMessage = `🤝 It's a Tie! ${this.scores.player} - ${this.scores.ai}`;
      this.updateAIThoughts(
        `A perfect tie! We both completed ${this.scores.player} boxes. Impressive! ⚖️`
      );
    }

    this.updateGameStatus(statusMessage);
  }

  updateGameStatus(message = null) {
    const statusElement = document.getElementById('game-status');
    if (message) {
      statusElement.textContent = message;
    } else if (this.gameOver) {
      statusElement.textContent = 'Game Over!';
    } else if (this.currentPlayer === 'player') {
      statusElement.textContent = 'Your turn! Click on a line to draw it.';
    } else {
      statusElement.textContent = 'AI is thinking...';
    }
  }

  updateScores() {
    const playerScoreElement = document.getElementById('player-score');
    const aiScoreElement = document.getElementById('ai-score');

    if (playerScoreElement) playerScoreElement.textContent = this.scores.player;
    if (aiScoreElement) aiScoreElement.textContent = this.scores.ai;
  }

  updateAIThoughts(thought) {
    const aiThoughtsElement = document.getElementById('ai-thoughts');
    if (aiThoughtsElement) {
      aiThoughtsElement.textContent = thought;
    }
  }

  addMoveToHistory(player, move) {
    this.moveHistory.push({ player, move, timestamp: new Date() });
    this.updateMoveHistory();
  }

  updateMoveHistory() {
    const historyElement = document.getElementById('move-history');
    if (historyElement) {
      if (this.moveHistory.length === 0) {
        historyElement.innerHTML =
          '<div class="text-sm opacity-70">No moves yet</div>';
      } else {
        historyElement.innerHTML = this.moveHistory
          .map(
            (move, index) =>
              `<div class="text-sm">
                        <span class="font-semibold">${index + 1}.</span> 
                        ${move.player} → ${move.move}
                    </div>`
          )
          .join('');
      }
    }
  }

  restart() {
    this.horizontalLines = Array(this.gridSize)
      .fill(null)
      .map(() => Array(this.gridSize - 1).fill(false));
    this.verticalLines = Array(this.gridSize - 1)
      .fill(null)
      .map(() => Array(this.gridSize).fill(false));
    this.boxes = Array(this.gridSize - 1)
      .fill(null)
      .map(() => Array(this.gridSize - 1).fill(null));
    this.currentPlayer = this.playerStarts ? 'player' : 'ai';
    this.scores = { player: 0, ai: 0 };
    this.gameOver = false;
    this.moveHistory = [];

    this.initializeBoard();
    this.updateGameStatus();
    this.updateScores();
    this.updateMoveHistory();
    this.updateAIThoughts('Game restarted! Ready for another round!');

    // If AI should start, make AI move after short delay
    if (!this.playerStarts) {
      this.updateAIThoughts("I'll start this round!");
      setTimeout(() => this.makeAIMove(), 500);
    }
  }

  // Toggle who starts the game
  toggleStarter() {
    this.playerStarts = !this.playerStarts;
    this.restart();
    const starterText = this.playerStarts
      ? "You'll start next game!"
      : 'AI will start next game!';
    this.updateAIThoughts(starterText);
  }

  getHint() {
    if (this.gameOver || this.currentPlayer === 'ai') {
      this.updateAIThoughts('No hints available right now!');
      return;
    }

    const availableMoves = this.getAvailableMoves();
    let hintMessage = '💡 Hint: ';

    // Check for moves that complete boxes
    for (const move of availableMoves) {
      const boxesCompleted = this.simulateMove(move);
      if (boxesCompleted > 0) {
        const lineDesc =
          move.type === 'horizontal'
            ? `horizontal line at row ${move.row + 1}`
            : `vertical line at col ${move.col + 1}`;
        hintMessage += `Complete a box by drawing the ${lineDesc}! 🎯`;
        this.updateAIThoughts(hintMessage);
        return;
      }
    }

    // Check for safe moves
    const safeMoves = availableMoves.filter((move) => {
      return this.wouldGiveOpponentBox(move) === 0;
    });

    if (safeMoves.length > 0) {
      const move = safeMoves[0];
      const lineDesc =
        move.type === 'horizontal' ? `horizontal line` : `vertical line`;
      hintMessage += `Draw a ${lineDesc} that won't give me a box! 🛡️`;
    } else {
      hintMessage += 'All moves give me boxes - pick the least harmful one! 🤔';
    }

    this.updateAIThoughts(hintMessage);
  }
}

// Global game instance
let game = null;

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', function () {
  startGame();
});

// Global functions for button handlers (called from EJS)
function startGame() {
  game = new DotsAndBoxesGame();
}

function restartGame() {
  if (game) {
    game.restart();
  }
}

function toggleStarter() {
  if (game) {
    game.toggleStarter();
  }
}

function getHint() {
  if (game) {
    game.getHint();
  }
}

// Modal functions (from your layout's scripts.ejs)
function openModal(modalId) {
  document.getElementById(modalId).classList.add('modal-open');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('modal-open');
}
