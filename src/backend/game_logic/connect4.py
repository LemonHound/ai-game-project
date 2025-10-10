import random
from typing import Dict, List, Optional, Tuple
from datetime import datetime

class Connect4Game:
    def __init__(self):
        self.sessions = {}
        self.ROWS = 6
        self.COLS = 7

    def start_game(self, user_id: Optional[int], difficulty: str = "medium", playerStarts: bool = True):
        """Initialize a new Connect 4 game session"""
        session_id = f"connect4_{user_id or 0}_{datetime.now().timestamp()}"

        game_state = {
            'board': [[None for _ in range(self.COLS)] for _ in range(self.ROWS)],
            'currentPlayer': 'player',  # 'player' or 'ai'
            'gameActive': True,
            'moveCount': 0,
            'lastMove': None
        }

        self.sessions[session_id] = game_state

        return {
            'gameSessionId': session_id,
            'boardState': game_state['board'],
            'currentPlayer': game_state['currentPlayer'],
            'gameActive': game_state['gameActive']
        }

    def make_move(self, session_id: str, move: Dict, user_id: Optional[int]):
        """Execute player move and generate AI response"""
        if session_id not in self.sessions:
            raise ValueError("Invalid session")

        game_state = self.sessions[session_id]

        if not game_state['gameActive']:
            raise ValueError("Game is not active")

        if game_state['currentPlayer'] != 'player':
            raise ValueError("Not player's turn")

        # Extract column from move
        col = move.get('col')
        if col is None or not (0 <= col < self.COLS):
            raise ValueError("Invalid column")

        # Execute player move
        row = self._drop_piece(game_state, col, 'player')
        if row is None:
            raise ValueError("Column is full")

        game_state['lastMove'] = {'row': row, 'col': col, 'player': 'player'}
        game_state['moveCount'] += 1

        # Check for player win
        if self._check_win(game_state, row, col, 'player'):
            game_state['gameActive'] = False
            return {
                'success': True,
                'boardState': game_state['board'],
                'currentPlayer': game_state['currentPlayer'],
                'gameActive': False,
                'aiMove': None,
                'gameOver': True,
                'winner': 'player',
                'winningLine': self._get_winning_line(game_state, row, col, 'player')
            }

        # Check for draw
        if game_state['moveCount'] >= self.ROWS * self.COLS:
            game_state['gameActive'] = False
            return {
                'success': True,
                'boardState': game_state['board'],
                'currentPlayer': game_state['currentPlayer'],
                'gameActive': False,
                'aiMove': None,
                'gameOver': True,
                'winner': 'draw',
                'winningLine': None
            }

        # Switch to AI turn
        game_state['currentPlayer'] = 'ai'

        # Generate AI move
        ai_move = self._generate_ai_move(game_state)

        if ai_move:
            ai_row, ai_col = ai_move
            game_state['lastMove'] = {'row': ai_row, 'col': ai_col, 'player': 'ai'}
            game_state['moveCount'] += 1

            # Check for AI win
            if self._check_win(game_state, ai_row, ai_col, 'ai'):
                game_state['gameActive'] = False
                return {
                    'success': True,
                    'boardState': game_state['board'],
                    'currentPlayer': 'player',
                    'gameActive': False,
                    'aiMove': {'row': ai_row, 'col': ai_col},
                    'gameOver': True,
                    'winner': 'ai',
                    'winningLine': self._get_winning_line(game_state, ai_row, ai_col, 'ai')
                }

            # Check for draw after AI move
            if game_state['moveCount'] >= self.ROWS * self.COLS:
                game_state['gameActive'] = False
                return {
                    'success': True,
                    'boardState': game_state['board'],
                    'currentPlayer': 'player',
                    'gameActive': False,
                    'aiMove': {'row': ai_row, 'col': ai_col},
                    'gameOver': True,
                    'winner': 'draw',
                    'winningLine': None
                }

            # Switch back to player
            game_state['currentPlayer'] = 'player'

            return {
                'success': True,
                'boardState': game_state['board'],
                'currentPlayer': 'player',
                'gameActive': True,
                'aiMove': {'row': ai_row, 'col': ai_col},
                'gameOver': False,
                'winner': None,
                'winningLine': None
            }

        # No valid AI move found (shouldn't happen unless board is full)
        game_state['gameActive'] = False
        return {
            'success': True,
            'boardState': game_state['board'],
            'currentPlayer': 'player',
            'gameActive': False,
            'aiMove': None,
            'gameOver': True,
            'winner': 'draw',
            'winningLine': None
        }

    def ai_first_move(self, session_id: str, user_id: Optional[int]):
        """Let AI make the first move"""
        if session_id not in self.sessions:
            raise ValueError("Invalid session")

        game_state = self.sessions[session_id]

        if not game_state['gameActive']:
            raise ValueError("Game is not active")

        if game_state['moveCount'] > 0:
            raise ValueError("Game already started")

        # AI makes first move
        game_state['currentPlayer'] = 'ai'
        ai_move = self._generate_ai_move(game_state)

        if ai_move:
            ai_row, ai_col = ai_move
            game_state['lastMove'] = {'row': ai_row, 'col': ai_col, 'player': 'ai'}
            game_state['moveCount'] += 1
            game_state['currentPlayer'] = 'player'

            return {
                'success': True,
                'boardState': game_state['board'],
                'currentPlayer': 'player',
                'gameActive': True,
                'aiMove': {'row': ai_row, 'col': ai_col}
            }

        raise ValueError("AI could not make first move")

    def _drop_piece(self, game_state: Dict, col: int, player: str) -> Optional[int]:
        """Drop a piece in the specified column, return row or None if full"""
        board = game_state['board']

        # Find the lowest available row in this column
        for row in range(self.ROWS - 1, -1, -1):
            if board[row][col] is None:
                board[row][col] = player
                return row

        return None

    def _generate_ai_move(self, game_state: Dict) -> Optional[Tuple[int, int]]:
        """Generate a random valid move for the AI with up to 500 attempts"""
        board = game_state['board']

        # Get all available columns
        available_cols = [col for col in range(self.COLS) if board[0][col] is None]

        if not available_cols:
            return None

        # For now, just pick a random available column
        # Future: implement minimax or neural network here
        for _ in range(500):
            col = random.choice(available_cols)
            row = self._drop_piece(game_state, col, 'ai')

            if row is not None:
                return (row, col)

        raise ValueError("AI could not generate a valid move after 500 attempts")

    def _check_win(self, game_state: Dict, row: int, col: int, player: str) -> bool:
        """Check if the last move resulted in a win"""
        board = game_state['board']

        # Check horizontal
        count = 1
        # Check left
        c = col - 1
        while c >= 0 and board[row][c] == player:
            count += 1
            c -= 1
        # Check right
        c = col + 1
        while c < self.COLS and board[row][c] == player:
            count += 1
            c += 1
        if count >= 4:
            return True

        # Check vertical
        count = 1
        # Check down
        r = row + 1
        while r < self.ROWS and board[r][col] == player:
            count += 1
            r += 1
        # Check up
        r = row - 1
        while r >= 0 and board[r][col] == player:
            count += 1
            r -= 1
        if count >= 4:
            return True

        # Check diagonal (top-left to bottom-right)
        count = 1
        # Check up-left
        r, c = row - 1, col - 1
        while r >= 0 and c >= 0 and board[r][c] == player:
            count += 1
            r -= 1
            c -= 1
        # Check down-right
        r, c = row + 1, col + 1
        while r < self.ROWS and c < self.COLS and board[r][c] == player:
            count += 1
            r += 1
            c += 1
        if count >= 4:
            return True

        # Check diagonal (top-right to bottom-left)
        count = 1
        # Check up-right
        r, c = row - 1, col + 1
        while r >= 0 and c < self.COLS and board[r][c] == player:
            count += 1
            r -= 1
            c += 1
        # Check down-left
        r, c = row + 1, col - 1
        while r < self.ROWS and c >= 0 and board[r][c] == player:
            count += 1
            r += 1
            c -= 1
        if count >= 4:
            return True

        return False

    def _get_winning_line(self, game_state: Dict, row: int, col: int, player: str) -> Optional[List[Dict]]:
        """Get the coordinates of the winning line"""
        board = game_state['board']

        # Check horizontal
        positions = []
        c = col
        while c >= 0 and board[row][c] == player:
            c -= 1
        c += 1
        while c < self.COLS and board[row][c] == player:
            positions.append({'row': row, 'col': c})
            c += 1
        if len(positions) >= 4:
            return positions[:4]

        # Check vertical
        positions = []
        r = row
        while r >= 0 and board[r][col] == player:
            r -= 1
        r += 1
        while r < self.ROWS and board[r][col] == player:
            positions.append({'row': r, 'col': col})
            r += 1
        if len(positions) >= 4:
            return positions[:4]

        # Check diagonal (top-left to bottom-right)
        positions = []
        r, c = row, col
        while r >= 0 and c >= 0 and board[r][c] == player:
            r -= 1
            c -= 1
        r += 1
        c += 1
        while r < self.ROWS and c < self.COLS and board[r][c] == player:
            positions.append({'row': r, 'col': c})
            r += 1
            c += 1
        if len(positions) >= 4:
            return positions[:4]

        # Check diagonal (top-right to bottom-left)
        positions = []
        r, c = row, col
        while r >= 0 and c < self.COLS and board[r][c] == player:
            r -= 1
            c += 1
        r += 1
        c -= 1
        while r < self.ROWS and c >= 0 and board[r][c] == player:
            positions.append({'row': r, 'col': c})
            r += 1
            c -= 1
        if len(positions) >= 4:
            return positions[:4]

        return None

# Global instance
connect4_game = Connect4Game()