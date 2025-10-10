import random
import hashlib
import uuid
from typing import Optional, Dict, Any, List, Tuple
from database import get_db_connection, return_db_connection

class TicTacToe:
    """Tic Tac Toe game logic and AI"""

    WINNING_LINES = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],  # rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8],  # columns
        [0, 4, 8], [2, 4, 6]              # diagonals
    ]

    def __init__(self):
        self.sessions = {}  # In-memory session storage

    def start_game(self, user_id: Optional[int], difficulty: str = 'medium', player_starts: bool = True) -> Dict[str, Any]:
        """Initialize a new game"""
        session_id = f"tic-tac-toe-{uuid.uuid4()}"

        game_state = {
            'sessionId': session_id,
            'userId': user_id,
            'board': [None] * 9,
            'currentPlayer': 'X' if player_starts else 'O',
            'playerSymbol': 'X',
            'aiSymbol': 'O',
            'gameOver': False,
            'winner': None,
            'moveHistory': [],
            'moveCount': 0,
            'difficulty': difficulty,
            'playerStarts': player_starts,
            'isPersisted': False
        }

        self.sessions[session_id] = game_state

        return {
            'gameSessionId': session_id,
            'board': game_state['board'],
            'currentPlayer': game_state['currentPlayer'],
            'playerSymbol': 'X',
            'aiSymbol': 'O',
            'message': 'Game started'
        }

    def make_move(self, session_id: str, position: int, user_id: Optional[int] = None) -> Dict[str, Any]:
        """Process a player move and optionally AI response"""
        if session_id not in self.sessions:
            raise ValueError("Game session not found")

        game_state = self.sessions[session_id]

        if game_state['gameOver']:
            raise ValueError("Game is already over")

        if not (0 <= position <= 8):
            raise ValueError("Invalid position")

        if game_state['board'][position] is not None:
            raise ValueError("Position already taken")

        # Make player move
        game_state['board'][position] = game_state['currentPlayer']
        game_state['moveCount'] += 1
        game_state['moveHistory'].append({
            'player': game_state['currentPlayer'],
            'position': position,
            'moveNumber': game_state['moveCount']
        })

        # Lazy database initialization on first move
        if not game_state['isPersisted'] and user_id:
            self._initialize_game_in_db(game_state, user_id)
            game_state['isPersisted'] = True

        # Save state to DB
        if game_state['isPersisted']:
            self._save_state_to_db(game_state)

        # Check if game ended after player move
        winner = self._check_winner(game_state['board'])
        if winner or self._is_board_full(game_state['board']):
            game_state['gameOver'] = True
            game_state['winner'] = winner if winner else 'tie'

            if game_state['isPersisted']:
                self._complete_game_in_db(game_state)

            return {
                'success': True,
                'gameState': self._get_client_state(game_state),
                'aiMove': None,
                'gameOver': True,
                'winner': game_state['winner']
            }

        # Switch to AI
        game_state['currentPlayer'] = 'O'

        # AI makes move
        ai_position = self._get_ai_move(game_state['board'], game_state['difficulty'])

        game_state['board'][ai_position] = 'O'
        game_state['moveCount'] += 1
        game_state['moveHistory'].append({
            'player': 'O',
            'position': ai_position,
            'moveNumber': game_state['moveCount']
        })

        # Save AI state
        if game_state['isPersisted']:
            self._save_state_to_db(game_state)

        # Check if game ended after AI move
        winner = self._check_winner(game_state['board'])
        if winner or self._is_board_full(game_state['board']):
            game_state['gameOver'] = True
            game_state['winner'] = winner if winner else 'tie'

            if game_state['isPersisted']:
                self._complete_game_in_db(game_state)

            return {
                'success': True,
                'gameState': self._get_client_state(game_state),
                'aiMove': {'position': ai_position},
                'gameOver': True,
                'winner': game_state['winner']
            }

        # Game continues
        game_state['currentPlayer'] = 'X'

        return {
            'success': True,
            'gameState': self._get_client_state(game_state),
            'aiMove': {'position': ai_position},
            'gameOver': False,
            'winner': None
        }

    def _get_ai_move(self, board: List[Optional[str]], difficulty: str) -> int:
        """Get AI move based on difficulty"""
        available_positions = [i for i, cell in enumerate(board) if cell is None]

        if not available_positions:
            raise ValueError("No moves available")

        if difficulty == 'easy':
            return random.choice(available_positions)

        elif difficulty == 'medium':
            # Try to win
            win_move = self._find_winning_move(board, 'O')
            if win_move is not None:
                return win_move

            # Block player win
            block_move = self._find_winning_move(board, 'X')
            if block_move is not None:
                return block_move

            # Take center if available
            if 4 in available_positions:
                return 4

            # Take corners
            corners = [0, 2, 6, 8]
            available_corners = [c for c in corners if c in available_positions]
            if available_corners:
                return random.choice(available_corners)

            return random.choice(available_positions)

        else:  # hard - minimax
            return self._get_best_move(board)

    def _find_winning_move(self, board: List[Optional[str]], player: str) -> Optional[int]:
        """Find a move that wins for the given player"""
        for line in self.WINNING_LINES:
            positions = [board[i] for i in line]
            if positions.count(player) == 2 and positions.count(None) == 1:
                for i in line:
                    if board[i] is None:
                        return i
        return None

    def _get_best_move(self, board: List[Optional[str]]) -> int:
        """Get best move using minimax algorithm"""
        best_score = -float('inf')
        best_move = None

        for i in range(9):
            if board[i] is None:
                board[i] = 'O'
                score = self._minimax(board, 0, False)
                board[i] = None

                if score > best_score:
                    best_score = score
                    best_move = i

        return best_move if best_move is not None else 0

    def _minimax(self, board: List[Optional[str]], depth: int, is_maximizing: bool) -> int:
        """Minimax algorithm for optimal AI"""
        winner = self._check_winner(board)
        if winner == 'O':
            return 1
        if winner == 'X':
            return -1
        if self._is_board_full(board):
            return 0

        if is_maximizing:
            best_score = -float('inf')
            for i in range(9):
                if board[i] is None:
                    board[i] = 'O'
                    score = self._minimax(board, depth + 1, False)
                    board[i] = None
                    best_score = max(score, best_score)
            return best_score
        else:
            best_score = float('inf')
            for i in range(9):
                if board[i] is None:
                    board[i] = 'X'
                    score = self._minimax(board, depth + 1, True)
                    board[i] = None
                    best_score = min(score, best_score)
            return best_score

    def _check_winner(self, board: List[Optional[str]]) -> Optional[str]:
        """Check if there's a winner"""
        for line in self.WINNING_LINES:
            if board[line[0]] and board[line[0]] == board[line[1]] == board[line[2]]:
                return board[line[0]]
        return None

    def _is_board_full(self, board: List[Optional[str]]) -> bool:
        """Check if board is full"""
        return None not in board

    def _get_client_state(self, game_state: Dict[str, Any]) -> Dict[str, Any]:
        """Get state for client response"""
        return {
            'board': game_state['board'],
            'currentPlayer': game_state['currentPlayer'],
            'gameOver': game_state['gameOver'],
            'winner': game_state['winner'],
            'moveCount': game_state['moveCount']
        }

    def _initialize_game_in_db(self, game_state: Dict[str, Any], user_id: int):
        """Initialize game record in database"""
        conn = None
        try:
            conn = get_db_connection()
            if not conn:
                return

            cursor = conn.cursor()
            cursor.execute(
                "SELECT start_tic_tac_toe_game(%s, %s, %s, %s)",
                (user_id, game_state['sessionId'], game_state['playerStarts'], game_state['difficulty'])
            )
            conn.commit()
            cursor.close()
        except Exception as e:
            print(f"Error initializing game in DB: {e}")
            if conn:
                conn.rollback()
        finally:
            if conn:
                return_db_connection(conn)

    def _save_state_to_db(self, game_state: Dict[str, Any]):
        """Save current board state for AI learning"""
        conn = None
        try:
            conn = get_db_connection()
            if not conn:
                return

            board_state = ''.join([cell if cell else '_' for cell in game_state['board']])

            cursor = conn.cursor()
            cursor.execute(
                "SELECT upsert_tic_tac_toe_state(%s, %s)",
                (board_state, game_state['moveCount'])
            )
            conn.commit()
            cursor.close()
        except Exception as e:
            print(f"Error saving state to DB: {e}")
            if conn:
                conn.rollback()
        finally:
            if conn:
                return_db_connection(conn)

    def _complete_game_in_db(self, game_state: Dict[str, Any]):
        """Mark game as complete in database"""
        conn = None
        try:
            conn = get_db_connection()
            if not conn:
                return

            move_sequence = ','.join([
                f"{move['player']}:{move['position']}"
                for move in game_state['moveHistory']
            ])

            winner = 'T' if game_state['winner'] == 'tie' else game_state['winner']

            cursor = conn.cursor()
            cursor.execute(
                "SELECT complete_tic_tac_toe_game(%s, %s, %s, %s, %s, %s)",
                (
                    game_state['sessionId'],
                    move_sequence,
                    winner,
                    game_state['moveCount'],
                    0,  # final_score
                    game_state['userId']
                )
            )
            conn.commit()
            cursor.close()

            # Clean up session
            if game_state['sessionId'] in self.sessions:
                del self.sessions[game_state['sessionId']]
        except Exception as e:
            print(f"Error completing game in DB: {e}")
            if conn:
                conn.rollback()
        finally:
            if conn:
                return_db_connection(conn)

# Global instance
tic_tac_toe_game = TicTacToe()