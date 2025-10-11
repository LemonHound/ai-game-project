import random
from typing import Dict, List, Tuple, Optional
from datetime import datetime

class ChessGame:
    def __init__(self):
        self.sessions = {}

    def start_game(self, user_id: Optional[int], difficulty: str = "medium", playerStarts: bool = True):
        """Initialize a new chess game session"""
        session_id = f"chess_{user_id or 0}_{datetime.now().timestamp()}"

        game_state = {
            'board': self._create_initial_board(),
            'currentPlayer': 'white',
            'playerColor': 'white' if playerStarts else 'black',
            'gameActive': True,
            'kingPositions': {'white': [7, 4], 'black': [0, 4]},
            'castlingRights': {
                'white': {'kingside': True, 'queenside': True},
                'black': {'kingside': True, 'queenside': True}
            },
            'enPassantTarget': None,
            'moveHistory': [],
            'capturedPieces': {'player': [], 'ai': []},
        }

        self.sessions[session_id] = game_state

        return {
            'gameSessionId': session_id,
            'boardState': game_state['board'],
            'currentPlayer': game_state['currentPlayer'],
            'playerColor': game_state['playerColor'],
            'gameActive': game_state['gameActive']
        }

    def make_move(self, session_id: str, move: Dict, user_id: int):
        """Validate and execute a player move, then generate AI response"""
        if session_id not in self.sessions:
            raise ValueError("Invalid session")

        game_state = self.sessions[session_id]

        if not game_state['gameActive']:
            raise ValueError("Game is not active")

        # Validate it's the player's turn
        if game_state['currentPlayer'] != game_state['playerColor']:
            raise ValueError("Not player's turn")

        # Execute player move
        from_row, from_col = move['fromRow'], move['fromCol']
        to_row, to_col = move['toRow'], move['toCol']
        promotion_piece = move.get('promotionPiece')

        # Validate and execute the move
        if not self._execute_move(game_state, from_row, from_col, to_row, to_col, promotion_piece):
            raise ValueError("Invalid move")

        # Check for game end after player move
        game_over, winner = self._check_game_end(game_state)

        ai_move = None
        if not game_over:
            # Generate AI move
            ai_move = self._generate_ai_move(game_state)

            if ai_move:
                # Check for game end after AI move
                game_over, winner = self._check_game_end(game_state)

        return {
            'success': True,
            'boardState': game_state['board'],
            'currentPlayer': game_state['currentPlayer'],
            'gameActive': game_state['gameActive'],
            'aiMove': ai_move,
            'gameOver': game_over,
            'winner': winner,
            'inCheck': self._is_in_check(game_state, game_state['currentPlayer'])
        }

    def _generate_ai_move(self, game_state: Dict) -> Optional[Dict]:
        """Generate a random valid move for the AI with up to 500 attempts"""
        ai_color = 'white' if game_state['playerColor'] == 'black' else 'black'

        for attempt in range(500):
            # Get all AI pieces
            ai_pieces = []
            for row in range(8):
                for col in range(8):
                    piece = game_state['board'][row][col]
                    if piece and self._is_piece_color(piece, ai_color):
                        ai_pieces.append((row, col, piece))

            if not ai_pieces:
                return None

            # Pick random piece
            from_row, from_col, piece = random.choice(ai_pieces)

            # Get valid moves for this piece
            valid_moves = self._get_valid_moves(game_state, from_row, from_col)

            if not valid_moves:
                continue

            # Pick random move
            to_row, to_col = random.choice(valid_moves)

            # Check if pawn promotion
            promotion_piece = None
            if piece.lower() == 'p':
                promotion_rank = 0 if ai_color == 'white' else 7
                if to_row == promotion_rank:
                    promotion_piece = 'Q' if ai_color == 'white' else 'q'

            # Try to execute the move
            if self._execute_move(game_state, from_row, from_col, to_row, to_col, promotion_piece):
                return {
                    'fromRow': from_row,
                    'fromCol': from_col,
                    'toRow': to_row,
                    'toCol': to_col,
                    'piece': piece,
                    'promotionPiece': promotion_piece
                }

        # If we couldn't find a valid move after 500 attempts, raise error
        raise ValueError("AI could not generate a valid move after 500 attempts")

    def _execute_move(self, game_state: Dict, from_row: int, from_col: int,
                      to_row: int, to_col: int, promotion_piece: Optional[str] = None) -> bool:
        """Execute a move on the board, return True if successful"""
        board = game_state['board']
        piece = board[from_row][from_col]

        if not piece:
            return False

        is_white = self._is_white_piece(piece)
        current_color = 'white' if is_white else 'black'

        # Validate it's this color's turn
        if current_color != game_state['currentPlayer']:
            return False

        # Get valid moves and check if this move is valid
        valid_moves = self._get_valid_moves(game_state, from_row, from_col)
        if [to_row, to_col] not in valid_moves:
            return False

        captured = board[to_row][to_col]
        final_piece = promotion_piece if promotion_piece else piece

        # Handle castling
        if piece.lower() == 'k' and abs(to_col - from_col) == 2:
            is_kingside = to_col > from_col
            rook_from_col = 7 if is_kingside else 0
            rook_to_col = to_col - 1 if is_kingside else to_col + 1

            board[to_row][to_col] = piece
            board[from_row][from_col] = None
            board[from_row][rook_to_col] = board[from_row][rook_from_col]
            board[from_row][rook_from_col] = None

            game_state['kingPositions'][current_color] = [to_row, to_col]

        # Handle en passant
        elif (piece.lower() == 'p' and game_state['enPassantTarget'] and
              to_row == game_state['enPassantTarget'][0] and
              to_col == game_state['enPassantTarget'][1]):
            captured_row = to_row + 1 if is_white else to_row - 1
            captured_pawn = board[captured_row][to_col]
            if captured_pawn:
                captured = captured_pawn
            board[captured_row][to_col] = None
            board[to_row][to_col] = final_piece
            board[from_row][from_col] = None

        # Regular move
        else:
            board[to_row][to_col] = final_piece
            board[from_row][from_col] = None

            if piece.lower() == 'k':
                game_state['kingPositions'][current_color] = [to_row, to_col]

        # Update castling rights
        if piece.lower() == 'k':
            game_state['castlingRights'][current_color]['kingside'] = False
            game_state['castlingRights'][current_color]['queenside'] = False
        elif piece.lower() == 'r':
            if from_col == 0:
                game_state['castlingRights'][current_color]['queenside'] = False
            if from_col == 7:
                game_state['castlingRights'][current_color]['kingside'] = False

        # Set en passant target
        if piece.lower() == 'p' and abs(to_row - from_row) == 2:
            game_state['enPassantTarget'] = [from_row - 1 if is_white else from_row + 1, from_col]
        else:
            game_state['enPassantTarget'] = None

        # Track captured pieces
        if captured:
            if current_color == game_state['playerColor']:
                game_state['capturedPieces']['player'].append(captured)
            else:
                game_state['capturedPieces']['ai'].append(captured)

        # Add to move history
        game_state['moveHistory'].append({
            'from': [from_row, from_col],
            'to': [to_row, to_col],
            'piece': final_piece,
            'captured': captured
        })

        # Switch turns
        game_state['currentPlayer'] = 'black' if game_state['currentPlayer'] == 'white' else 'white'

        return True

    def _get_valid_moves(self, game_state: Dict, row: int, col: int) -> List[List[int]]:
        """Get all valid moves for a piece at the given position"""
        board = game_state['board']
        piece = board[row][col]

        if not piece:
            return []

        piece_type = piece.lower()
        moves = []

        if piece_type == 'p':
            moves = self._get_pawn_moves(game_state, row, col)
        elif piece_type == 'r':
            moves = self._get_linear_moves(game_state, row, col, [[0, 1], [0, -1], [1, 0], [-1, 0]])
        elif piece_type == 'b':
            moves = self._get_linear_moves(game_state, row, col, [[1, 1], [1, -1], [-1, 1], [-1, -1]])
        elif piece_type == 'q':
            moves = self._get_linear_moves(game_state, row, col,
                                           [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]])
        elif piece_type == 'n':
            moves = self._get_knight_moves(game_state, row, col)
        elif piece_type == 'k':
            moves = self._get_king_moves(game_state, row, col)

        # Filter moves that would leave king in check
        return [m for m in moves if not self._would_be_in_check(game_state, row, col, m[0], m[1])]

    def _get_pawn_moves(self, game_state: Dict, row: int, col: int) -> List[List[int]]:
        """Get valid pawn moves"""
        board = game_state['board']
        piece = board[row][col]
        is_white = self._is_white_piece(piece)
        direction = -1 if is_white else 1
        start_row = 6 if is_white else 1
        moves = []

        # Forward one
        if 0 <= row + direction < 8 and not board[row + direction][col]:
            moves.append([row + direction, col])

            # Forward two from start
            if row == start_row and not board[row + 2 * direction][col]:
                moves.append([row + 2 * direction, col])

        # Diagonal captures
        for dcol in [-1, 1]:
            new_row, new_col = row + direction, col + dcol
            if 0 <= new_row < 8 and 0 <= new_col < 8:
                target = board[new_row][new_col]
                if target and self._is_white_piece(target) != is_white:
                    moves.append([new_row, new_col])

                # En passant
                ep_target = game_state['enPassantTarget']
                if ep_target and new_row == ep_target[0] and new_col == ep_target[1]:
                    moves.append([new_row, new_col])

        return moves

    def _get_knight_moves(self, game_state: Dict, row: int, col: int) -> List[List[int]]:
        """Get valid knight moves"""
        board = game_state['board']
        piece = board[row][col]
        is_white = self._is_white_piece(piece)
        moves = []

        knight_moves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]

        for dr, dc in knight_moves:
            new_row, new_col = row + dr, col + dc
            if 0 <= new_row < 8 and 0 <= new_col < 8:
                target = board[new_row][new_col]
                if not target or self._is_white_piece(target) != is_white:
                    moves.append([new_row, new_col])

        return moves

    def _get_king_moves(self, game_state: Dict, row: int, col: int) -> List[List[int]]:
        """Get valid king moves including castling"""
        board = game_state['board']
        piece = board[row][col]
        is_white = self._is_white_piece(piece)
        color = 'white' if is_white else 'black'
        moves = []

        king_moves = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]

        for dr, dc in king_moves:
            new_row, new_col = row + dr, col + dc
            if 0 <= new_row < 8 and 0 <= new_col < 8:
                target = board[new_row][new_col]
                if not target or self._is_white_piece(target) != is_white:
                    moves.append([new_row, new_col])

        # Castling
        if self._can_castle(game_state, color, True):
            moves.append([row, col + 2])
        if self._can_castle(game_state, color, False):
            moves.append([row, col - 2])

        return moves

    def _get_linear_moves(self, game_state: Dict, row: int, col: int,
                          directions: List[List[int]]) -> List[List[int]]:
        """Get valid moves in linear directions (rook, bishop, queen)"""
        board = game_state['board']
        piece = board[row][col]
        is_white = self._is_white_piece(piece)
        moves = []

        for dr, dc in directions:
            for i in range(1, 8):
                new_row, new_col = row + dr * i, col + dc * i
                if not (0 <= new_row < 8 and 0 <= new_col < 8):
                    break

                target = board[new_row][new_col]
                if not target:
                    moves.append([new_row, new_col])
                else:
                    if self._is_white_piece(target) != is_white:
                        moves.append([new_row, new_col])
                    break

        return moves

    def _can_castle(self, game_state: Dict, color: str, kingside: bool) -> bool:
        """Check if castling is possible"""
        rights = game_state['castlingRights'][color]
        if not rights['kingside' if kingside else 'queenside']:
            return False

        if self._is_in_check(game_state, color):
            return False

        king_pos = game_state['kingPositions'][color]
        king_row, king_col = king_pos
        rook_col = 7 if kingside else 0
        direction = 1 if kingside else -1
        board = game_state['board']

        # Check if path is clear
        for col in range(king_col + direction, rook_col, direction):
            if board[king_row][col]:
                return False

        # Check if king passes through attacked squares
        for i in range(3):
            if self._is_square_attacked(game_state, king_row, king_col + i * direction, color):
                return False

        return True

    def _would_be_in_check(self, game_state: Dict, from_row: int, from_col: int,
                           to_row: int, to_col: int) -> bool:
        """Check if a move would leave the king in check"""
        board = game_state['board']
        piece = board[from_row][from_col]
        original_piece = board[to_row][to_col]

        # Make temporary move
        board[to_row][to_col] = piece
        board[from_row][from_col] = None

        is_white = self._is_white_piece(piece)
        color = 'white' if is_white else 'black'

        # Update king position if moving king
        original_king_pos = None
        if piece.lower() == 'k':
            original_king_pos = game_state['kingPositions'][color][:]
            game_state['kingPositions'][color] = [to_row, to_col]

        in_check = self._is_in_check(game_state, color)

        # Undo temporary move
        board[from_row][from_col] = piece
        board[to_row][to_col] = original_piece

        if original_king_pos:
            game_state['kingPositions'][color] = original_king_pos

        return in_check

    def _is_in_check(self, game_state: Dict, color: str) -> bool:
        """Check if the king of the given color is in check"""
        king_pos = game_state['kingPositions'][color]
        return self._is_square_attacked(game_state, king_pos[0], king_pos[1], color)

    def _is_square_attacked(self, game_state: Dict, row: int, col: int, defending_color: str) -> bool:
        """Check if a square is attacked by the opponent"""
        board = game_state['board']
        attacking_color = 'black' if defending_color == 'white' else 'white'

        for r in range(8):
            for c in range(8):
                piece = board[r][c]
                if piece and self._is_piece_color(piece, attacking_color):
                    attacks = self._get_piece_attacks(game_state, r, c)
                    if [row, col] in attacks:
                        return True

        return False

    def _get_piece_attacks(self, game_state: Dict, row: int, col: int) -> List[List[int]]:
        """Get all squares a piece attacks (for check detection)"""
        board = game_state['board']
        piece = board[row][col]

        if not piece:
            return []

        piece_type = piece.lower()

        if piece_type == 'p':
            is_white = self._is_white_piece(piece)
            direction = -1 if is_white else 1
            attacks = []
            for dcol in [-1, 1]:
                new_row, new_col = row + direction, col + dcol
                if 0 <= new_row < 8 and 0 <= new_col < 8:
                    attacks.append([new_row, new_col])
            return attacks
        elif piece_type == 'n':
            return self._get_knight_moves(game_state, row, col)
        elif piece_type == 'b':
            return self._get_linear_moves(game_state, row, col, [[1, 1], [1, -1], [-1, 1], [-1, -1]])
        elif piece_type == 'r':
            return self._get_linear_moves(game_state, row, col, [[0, 1], [0, -1], [1, 0], [-1, 0]])
        elif piece_type == 'q':
            return self._get_linear_moves(game_state, row, col,
                                          [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]])
        elif piece_type == 'k':
            attacks = []
            for dr, dc in [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]:
                new_row, new_col = row + dr, col + dc
                if 0 <= new_row < 8 and 0 <= new_col < 8:
                    attacks.append([new_row, new_col])
            return attacks

        return []

    def _check_game_end(self, game_state: Dict) -> Tuple[bool, Optional[str]]:
        """Check if the game has ended (checkmate or stalemate)"""
        current_color = game_state['currentPlayer']

        if self._is_checkmate(game_state, current_color):
            winner = 'black' if current_color == 'white' else 'white'
            game_state['gameActive'] = False
            return True, winner

        if self._is_stalemate(game_state, current_color):
            game_state['gameActive'] = False
            return True, 'draw'

        return False, None

    def _is_checkmate(self, game_state: Dict, color: str) -> bool:
        """Check if the given color is in checkmate"""
        if not self._is_in_check(game_state, color):
            return False
        return not self._has_valid_moves(game_state, color)

    def _is_stalemate(self, game_state: Dict, color: str) -> bool:
        """Check if the given color is in stalemate"""
        if self._is_in_check(game_state, color):
            return False
        return not self._has_valid_moves(game_state, color)

    def _has_valid_moves(self, game_state: Dict, color: str) -> bool:
        """Check if the given color has any valid moves"""
        board = game_state['board']

        for row in range(8):
            for col in range(8):
                piece = board[row][col]
                if piece and self._is_piece_color(piece, color):
                    moves = self._get_valid_moves(game_state, row, col)
                    if moves:
                        return True

        return False

    def _is_white_piece(self, piece: str) -> bool:
        """Check if a piece is white (uppercase)"""
        return piece == piece.upper()

    def _is_piece_color(self, piece: str, color: str) -> bool:
        """Check if a piece belongs to the given color"""
        return (color == 'white') == self._is_white_piece(piece)

    def _create_initial_board(self) -> List[List[Optional[str]]]:
        """Create the initial chess board state"""
        return [
            ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
            ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
            [None, None, None, None, None, None, None, None],
            [None, None, None, None, None, None, None, None],
            [None, None, None, None, None, None, None, None],
            [None, None, None, None, None, None, None, None],
            ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
            ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
        ]

# Global instance
chess_game = ChessGame()