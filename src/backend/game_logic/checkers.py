import random
import hashlib
import uuid
from typing import Optional, Dict, Any, List, Tuple
from database import get_db_connection, return_db_connection

class CheckersGame:
    """Checkers game logic and AI"""

    def __init__(self):
        self.sessions = {}

    def start_game(self, user_id: Optional[int], difficulty: str = 'medium', player_starts: bool = True) -> Dict[str, Any]:
        """Initialize a new checkers game"""
        session_id = f"checkers-{uuid.uuid4()}"

        # Initialize 64-square board (8x8), but only 32 dark squares are playable
        # R=red piece, r=red king, B=black piece, b=black king, _=empty
        board = ['_'] * 64

        # Set up red pieces (player) - bottom 3 rows on dark squares
        red_positions = [40, 42, 44, 46, 49, 51, 53, 55, 56, 58, 60, 62]
        for pos in red_positions:
            board[pos] = 'R'

        # Set up black pieces (AI) - top 3 rows on dark squares
        black_positions = [1, 3, 5, 7, 8, 10, 12, 14, 17, 19, 21, 23]
        for pos in black_positions:
            board[pos] = 'B'

        game_state = {
            'sessionId': session_id,
            'userId': user_id,
            'board': board,
            'currentPlayer': 'R' if player_starts else 'B',
            'playerSymbol': 'R',
            'aiSymbol': 'B',
            'gameOver': False,
            'winner': None,
            'moveHistory': [],
            'moveCount': 0,
            'difficulty': difficulty,
            'playerStarts': player_starts,
            'mustCapture': None,
            'isPersisted': False
        }

        self.sessions[session_id] = game_state

        return {
            'sessionId': session_id,
            'state': {
                'board': game_state['board'],
                'currentPlayer': game_state['currentPlayer'],
                'gameOver': False,
                'winner': None,
                'moveCount': 0,
                'mustCapture': None,
                'playerStarts': player_starts
            }
        }

    def make_move(self, session_id: str, move: Dict[str, Any], user_id: Optional[int] = None) -> Dict[str, Any]:
        """Process a player move (potentially a chain) and AI response"""
        if session_id not in self.sessions:
            raise ValueError("Game session not found")

        game_state = self.sessions[session_id]

        if game_state['gameOver']:
            raise ValueError("Game is already over")

        # Handle move chain (multi-jump)
        if 'chain' in move:
            move_chain = move['chain']
            all_captured = []

            for single_move in move_chain:
                from_pos = single_move.get('from')
                to_pos = single_move.get('to')

                if from_pos is None or to_pos is None:
                    raise ValueError("Invalid move format in chain")

                if not self._is_valid_move(game_state, from_pos, to_pos):
                    raise ValueError(f"Invalid move in chain: {from_pos} to {to_pos}")

                captured = self._execute_move(game_state, from_pos, to_pos)
                all_captured.extend(captured)

            game_state['moveCount'] += 1
            game_state['moveHistory'].append({
                'player': game_state['currentPlayer'],
                'chain': move_chain,
                'captured': all_captured,
                'moveNumber': game_state['moveCount']
            })
        else:
            # Single move
            from_pos = move.get('from')
            to_pos = move.get('to')

            if from_pos is None or to_pos is None:
                raise ValueError("Invalid move format")

            if not self._is_valid_move(game_state, from_pos, to_pos):
                raise ValueError("Invalid move")

            captured = self._execute_move(game_state, from_pos, to_pos)
            game_state['moveCount'] += 1
            game_state['moveHistory'].append({
                'player': game_state['currentPlayer'],
                'from': from_pos,
                'to': to_pos,
                'captured': captured,
                'moveNumber': game_state['moveCount']
            })

        # Lazy database initialization
        if not game_state['isPersisted'] and user_id:
            self._initialize_game_in_db(game_state, user_id)
            game_state['isPersisted'] = True

        if game_state['isPersisted']:
            self._save_state_to_db(game_state)

        winner = self._check_winner(game_state)
        if winner:
            game_state['gameOver'] = True
            game_state['winner'] = winner

            if game_state['isPersisted']:
                self._complete_game_in_db(game_state)

            return {
                'success': True,
                'state': self._get_client_state(game_state),
                'aiMove': None,
                'gameOver': True,
                'winner': winner
            }

        # Switch to AI
        game_state['currentPlayer'] = 'B'

        # AI makes move (potentially chain)
        ai_move = self._get_ai_move_chain(game_state)

        if ai_move:
            if game_state['isPersisted']:
                self._save_state_to_db(game_state)

            winner = self._check_winner(game_state)
            if winner:
                game_state['gameOver'] = True
                game_state['winner'] = winner

                if game_state['isPersisted']:
                    self._complete_game_in_db(game_state)

                return {
                    'success': True,
                    'state': self._get_client_state(game_state),
                    'aiMove': ai_move,
                    'gameOver': True,
                    'winner': winner
                }

        game_state['currentPlayer'] = 'R'

        return {
            'success': True,
            'state': self._get_client_state(game_state),
            'aiMove': ai_move if ai_move else None
        }

    def _get_ai_move_chain(self, game_state: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Get AI move, including multi-jump chains"""
        move_chain = []
        current_pos = None
        last_was_capture = False

        # Keep making captures while possible
        while True:
            if current_pos is None:
                # First move - find any piece with captures
                board = game_state['board']
                ai_pieces = [i for i in range(64) if board[i] in ['B', 'b']]

                capture_moves = []
                for pos in ai_pieces:
                    moves = self._get_valid_moves_for_piece(game_state, pos)
                    captures = [m for m in moves if m['captures']]
                    capture_moves.extend(captures)

                if capture_moves:
                    move = random.choice(capture_moves)
                else:
                    # No captures, get any valid move
                    all_moves = []
                    for pos in ai_pieces:
                        moves = self._get_valid_moves_for_piece(game_state, pos)
                        all_moves.extend(moves)

                    if not all_moves:
                        return None

                    move = random.choice(all_moves)

                # Execute the move
                captured = self._execute_move(game_state, move['from'], move['to'])
                move_chain.append({
                    'from': move['from'],
                    'to': move['to'],
                    'captures': captured
                })

                current_pos = move['to']
                last_was_capture = len(captured) > 0

                # If no capture, we're done (can't chain non-captures)
                if not last_was_capture:
                    break
            else:
                # ONLY check for additional captures if the last move was a capture
                if not last_was_capture:
                    break

                # Check for additional captures from current position
                additional_moves = self._get_valid_moves_for_piece(game_state, current_pos)
                capture_moves = [m for m in additional_moves if m['captures']]

                if not capture_moves:
                    break

                # Continue the chain
                move = random.choice(capture_moves)
                captured = self._execute_move(game_state, move['from'], move['to'])
                move_chain.append({
                    'from': move['from'],
                    'to': move['to'],
                    'captures': captured
                })

                current_pos = move['to']
                last_was_capture = len(captured) > 0

        game_state['moveCount'] += 1
        game_state['moveHistory'].append({
            'player': 'B',
            'chain': move_chain if len(move_chain) > 1 else None,
            'from': move_chain[0]['from'] if len(move_chain) == 1 else None,
            'to': move_chain[-1]['to'] if len(move_chain) == 1 else None,
            'captured': sum([m['captures'] for m in move_chain], []),
            'moveNumber': game_state['moveCount']
        })

        if len(move_chain) > 1:
            return {'chain': move_chain}
        else:
            return move_chain[0]


    def _is_valid_move(self, game_state: Dict[str, Any], from_pos: int, to_pos: int) -> bool:
        """Check if a move is valid"""
        board = game_state['board']

        # Check bounds
        if not (0 <= from_pos < 64 and 0 <= to_pos < 64):
            return False

        # Check if from position has player's piece
        piece = board[from_pos]
        if piece == '_' or (game_state['currentPlayer'] == 'R' and piece not in ['R', 'r']) or \
                (game_state['currentPlayer'] == 'B' and piece not in ['B', 'b']):
            return False

        # Check if to position is empty
        if board[to_pos] != '_':
            return False

        # Get valid moves for this piece (which now enforces mandatory captures)
        valid_moves = self._get_valid_moves_for_piece(game_state, from_pos)

        return any(m['to'] == to_pos for m in valid_moves)

    def _get_valid_moves_for_piece(self, game_state: Dict[str, Any], pos: int) -> List[Dict[str, Any]]:
        """Get all valid moves for a piece at given position"""
        board = game_state['board']
        piece = board[pos]

        if piece == '_':
            return []

        row = pos // 8
        col = pos % 8

        # Determine which player this piece belongs to
        player = 'R' if piece in ['R', 'r'] else 'B'

        # First check for captures
        captures = self._calculate_captures_for_piece(game_state, pos)

        # If ANY captures are available for this player, only return capture moves
        if self._has_any_captures_available(game_state, player):
            return captures

        # Otherwise, check normal moves
        moves = []

        # Determine move directions
        if piece == 'R':
            directions = [(-1, -1), (-1, 1)]
        elif piece == 'B':
            directions = [(1, -1), (1, 1)]
        else:  # Kings
            directions = [(-1, -1), (-1, 1), (1, -1), (1, 1)]

        for dr, dc in directions:
            new_row, new_col = row + dr, col + dc

            if 0 <= new_row < 8 and 0 <= new_col < 8:
                new_pos = new_row * 8 + new_col

                if (new_row + new_col) % 2 == 1 and board[new_pos] == '_':
                    moves.append({'from': pos, 'to': new_pos, 'captures': []})

        return moves

    def _has_any_captures_available(self, game_state: Dict[str, Any], player: str) -> bool:
        """Check if the player has any capture moves available"""
        board = game_state['board']

        for i in range(64):
            piece = board[i]
            if player == 'R' and piece in ['R', 'r']:
                captures = self._calculate_captures_for_piece(game_state, i)
                if captures:
                    return True
            elif player == 'B' and piece in ['B', 'b']:
                captures = self._calculate_captures_for_piece(game_state, i)
                if captures:
                    return True

        return False

    def _calculate_captures_for_piece(self, game_state: Dict[str, Any], pos: int) -> List[Dict[str, Any]]:
        """Calculate only capture moves for a piece"""
        board = game_state['board']
        piece = board[pos]

        if piece == '_':
            return []

        captures = []
        row = pos // 8
        col = pos % 8

        # Determine move directions
        if piece == 'R':
            directions = [(-1, -1), (-1, 1)]
        elif piece == 'B':
            directions = [(1, -1), (1, 1)]
        else:  # Kings
            directions = [(-1, -1), (-1, 1), (1, -1), (1, 1)]

        # Check for captures
        for dr, dc in directions:
            new_row, new_col = row + dr, col + dc

            if 0 <= new_row < 8 and 0 <= new_col < 8:
                new_pos = new_row * 8 + new_col

                if (new_row + new_col) % 2 == 1:
                    if board[new_pos] != '_' and self._is_opponent_piece(piece, board[new_pos]):
                        jump_row, jump_col = new_row + dr, new_col + dc
                        if 0 <= jump_row < 8 and 0 <= jump_col < 8:
                            jump_pos = jump_row * 8 + jump_col
                            if board[jump_pos] == '_':
                                captures.append({'from': pos, 'to': jump_pos, 'captures': [new_pos]})

        return captures


    def _is_opponent_piece(self, piece: str, other: str) -> bool:
        """Check if other piece belongs to opponent"""
        if piece in ['R', 'r']:
            return other in ['B', 'b']
        elif piece in ['B', 'b']:
            return other in ['R', 'r']
        return False

    def _execute_move(self, game_state: Dict[str, Any], from_pos: int, to_pos: int) -> List[int]:
        """Execute a move and return captured pieces"""
        board = game_state['board']
        piece = board[from_pos]
        captured = []

        # Move the piece
        board[from_pos] = '_'

        # Check for capture (jump move)
        from_row, from_col = from_pos // 8, from_pos % 8
        to_row, to_col = to_pos // 8, to_pos % 8

        if abs(to_row - from_row) == 2:  # It's a jump
            mid_row = (from_row + to_row) // 2
            mid_col = (from_col + to_col) // 2
            mid_pos = mid_row * 8 + mid_col
            board[mid_pos] = '_'
            captured.append(mid_pos)

        # Check for king promotion
        if piece == 'R' and to_row == 0:
            piece = 'r'
        elif piece == 'B' and to_row == 7:
            piece = 'b'

        board[to_pos] = piece

        return captured

    def _get_ai_move(self, game_state: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Get AI move - random valid move for now"""
        board = game_state['board']

        # Get all AI pieces
        ai_pieces = []
        for i in range(64):
            if board[i] in ['B', 'b']:
                ai_pieces.append(i)

        # Get all valid moves for all pieces
        all_moves = []
        for pos in ai_pieces:
            moves = self._get_valid_moves_for_piece(game_state, pos)
            all_moves.extend(moves)

        if not all_moves:
            return None

        # Prioritize captures
        capture_moves = [m for m in all_moves if m['captures']]
        if capture_moves:
            return random.choice(capture_moves)

        # Otherwise random move
        return random.choice(all_moves)

    def _check_winner(self, game_state: Dict[str, Any]) -> Optional[str]:
        """Check if there's a winner"""
        board = game_state['board']

        red_pieces = sum(1 for p in board if p in ['R', 'r'])
        black_pieces = sum(1 for p in board if p in ['B', 'b'])

        if red_pieces == 0:
            return 'B'
        if black_pieces == 0:
            return 'R'

        # Check if current player has any valid moves
        current = game_state['currentPlayer']
        has_moves = False

        for i in range(64):
            if current == 'R' and board[i] in ['R', 'r']:
                if self._get_valid_moves_for_piece(game_state, i):
                    has_moves = True
                    break
            elif current == 'B' and board[i] in ['B', 'b']:
                if self._get_valid_moves_for_piece(game_state, i):
                    has_moves = True
                    break

        if not has_moves:
            return 'B' if current == 'R' else 'R'

        return None

    def _get_client_state(self, game_state: Dict[str, Any]) -> Dict[str, Any]:
        """Get state for client response"""
        return {
            'board': game_state['board'],
            'currentPlayer': game_state['currentPlayer'],
            'gameOver': game_state['gameOver'],
            'winner': game_state['winner'],
            'moveCount': game_state['moveCount'],
            'mustCapture': game_state['mustCapture'],
            'playerStarts': game_state['playerStarts']
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
                "SELECT start_checkers_game(%s, %s, %s, %s)",
                (user_id, game_state['sessionId'], game_state['playerStarts'], game_state['difficulty'])
            )
            conn.commit()
            cursor.close()
        except Exception as e:
            print(f"Error initializing checkers game in DB: {e}")
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

            board_state = ''.join(game_state['board'])

            cursor = conn.cursor()
            cursor.execute(
                "SELECT upsert_checkers_state(%s, %s)",
                (board_state, game_state['moveCount'])
            )
            conn.commit()
            cursor.close()
        except Exception as e:
            print(f"Error saving checkers state to DB: {e}")
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
                f"{move['player']}:{move['from']}-{move['to']}"
                for move in game_state['moveHistory']
            ])

            cursor = conn.cursor()
            cursor.execute(
                "SELECT complete_checkers_game(%s, %s, %s, %s, %s, %s)",
                (
                    game_state['sessionId'],
                    move_sequence,
                    game_state['winner'],
                    game_state['moveCount'],
                    0,
                    game_state['userId']
                )
            )
            conn.commit()
            cursor.close()

            if game_state['sessionId'] in self.sessions:
                del self.sessions[game_state['sessionId']]
        except Exception as e:
            print(f"Error completing checkers game in DB: {e}")
            if conn:
                conn.rollback()
        finally:
            if conn:
                return_db_connection(conn)

# Global instance
checkers_game = CheckersGame()