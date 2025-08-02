const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');

// Request AI move
router.post('/move', async (req, res) => {
  try {
    const { gameState } = req.body;

    // Call Python AI module
    const pythonProcess = spawn(process.env.PYTHON_PATH || 'python3', [
      path.join(__dirname, '../../ai/inference/game_ai.py'),
    ]);

    let result = '';
    let error = '';

    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        try {
          const aiResponse = JSON.parse(result);
          res.json(aiResponse);
        } catch (parseError) {
          res.status(500).json({ error: 'Invalid AI response' });
        }
      } else {
        res.status(500).json({ error: error || 'AI process failed' });
      }
    });

    // Send input to Python process
    pythonProcess.stdin.write(JSON.stringify(gameState));
    pythonProcess.stdin.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
