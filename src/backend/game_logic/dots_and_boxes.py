import random
import uuid
from typing import Optional, Dict, Any, List, Tuple, Set
from database import get_db_connection, return_db_connection

class DotsAndBoxes:
    """Dots and Boxes game logic and AI"""

    def __init__(self, grid_size: int = 4):
        self.sessions = {}  # In-memory session storage
        self.grid_size = grid_size  # Number of boxes per side (dots = grid_size + 1)

    def start_game(self, user_id: Optional[int], difficulty: str = 'medium', player_starts: bool = True) -> Dict[str, Any]:
        """Initialize a new game"""
        session_id = f"dots-and-boxes-{uuid.uuid4()}"

        game_state = {
            'sessionId': session_id,
            'userId': user_id,
            'gridSize': self.grid_size,
            'horizontalLines': {},  # {(row, col): player}
            'verticalLines': {},    # {(row, col): player}
            'boxes': {},            # {(row, col): player}
            'currentPlayer': 'X' if player_starts else 'O',
            'playerSymbol': 'X',
            'aiSymbol': 'O',
            'playerScore': 0,
            'aiScore': 0,
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
            'gridSize': self.grid_size,
            'horizontalLines': game_state['horizontalLines'],
            'verticalLines': game_state['verticalLines'],
            'boxes': game_state['boxes'],
            'currentPlayer': game_state['currentPlayer'],
            'playerScore': 0,
            'aiScore': 0,
            'message': 'Game started'
        }

    def make_move(self, session_id: str, move: Dict[str, Any], user_id: Optional[int] = None) -> Dict[str, Any]:
        """Process a player move and optionally AI response"""
        if session_id not in self.sessions:
            raise ValueError("Game session not found")

        game_state = self.sessions[session_id]

        if game_state['gameOver']:
            raise ValueError("Game is already over")

        # Validate and apply move
        line_type = move['type']  # 'horizontal' or 'vertical'
        row = move['row']
        col = move['col']

        if not self._is_valid_move(game_state, line_type, row, col):
            raise ValueError("Invalid move")

        # Apply player move
        boxes_completed = self._apply_move(game_state, line_type, row, col, game_state['currentPlayer'])

        game_state['moveCount'] += 1
        game_state['moveHistory'].append({
            'player': game_state['currentPlayer'],
            'type': line_type,
            'row': row,
            'col': col,
            'moveNumber': game_state['moveCount']
        })

        # Lazy database initialization
        if not game_state['isPersisted'] and user_id:
            self._initialize_game_in_db(game_state, user_id)
            game_state['isPersisted'] = True

        # Check if player gets another turn (completed a box)
        if boxes_completed > 0:
            if game_state['currentPlayer'] == 'X':
                game_state['playerScore'] += boxes_completed
            else:
                game_state['aiScore'] += boxes_completed
            # Player keeps their turn
        else:
            # Switch players
            game_state['currentPlayer'] = 'O' if game_state['currentPlayer'] == 'X' else 'X'

        # Check if game is over
        total_boxes = self.grid_size * self.grid_size
        if game_state['playerScore'] + game_state['aiScore'] >= total_boxes:
            game_state['gameOver'] = True
            if game_state['playerScore'] > game_state['aiScore']:
                game_state['winner'] = 'X'
            elif game_state['aiScore'] > game_state['playerScore']:
                game_state['winner'] = 'O'
            else:
                game_state['winner'] = 'tie'

            if game_state['isPersisted']:
                self._complete_game_in_db(game_state)

            return {
                'success': True,
                'gameState': self._get_client_state(game_state),
                'boxesCompleted': boxes_completed,
                'aiMoves': [],
                'gameOver': True,
                'winner': game_state['winner']
            }

        # AI makes moves if it's their turn
        ai_moves = []
        while game_state['currentPlayer'] == 'O' and not game_state['gameOver']:
            ai_move = self._get_ai_move(game_state)
            if not ai_move:
                break

            ai_boxes = self._apply_move(game_state, ai_move['type'], ai_move['row'], ai_move['col'], 'O')

            game_state['moveCount'] += 1
            game_state['moveHistory'].append({
                'player': 'O',
                'type': ai_move['type'],
                'row': ai_move['row'],
                'col': ai_move['col'],
                'moveNumber': game_state['moveCount']
            })

            ai_moves.append({
                'type': ai_move['type'],
                'row': ai_move['row'],
                'col': ai_move['col'],
                'boxesCompleted': ai_boxes
            })

            if ai_boxes > 0:
                game_state['aiScore'] += ai_boxes
                # AI keeps turn
            else:
                # Switch back to player
                game_state['currentPlayer'] = 'X'
                break

            # Check if game is over
            if game_state['playerScore'] + game_state['aiScore'] >= total_boxes:
                game_state['gameOver'] = True
                if game_state['playerScore'] > game_state['aiScore']:
                    game_state['winner'] = 'X'
                elif game_state['aiScore'] > game_state['playerScore']:
                    game_state['winner'] = 'O'
                else:
                    game_state['winner'] = 'tie'

                if game_state['isPersisted']:
                    self._complete_game_in_db(game_state)
                break

        return {
            'success': True,
            'gameState': self._get_client_state(game_state),
            'boxesCompleted': boxes_completed,
            'aiMoves': ai_moves,
            'gameOver': game_state['gameOver'],
            'winner': game_state.get('winner')
        }

    def _is_valid_move(self, game_state: Dict[str, Any], line_type: str, row: int, col: int) -> bool:
        """Check if a move is valid"""
        if line_type == 'horizontal':
            if row < 0 or row > self.grid_size or col < 0 or col >= self.grid_size:
                return False
            return (row, col) not in game_state['horizontalLines']
        elif line_type == 'vertical':
            if row < 0 or row >= self.grid_size or col < 0 or col > self.grid_size:
                return False
            return (row, col) not in game_state['verticalLines']
        return False

    def _apply_move(self, game_state: Dict[str, Any], line_type: str, row: int, col: int, player: str) -> int:
        """Apply a move and return number of boxes completed"""
        if line_type == 'horizontal':
            game_state['horizontalLines'][(row, col)] = player
        else:
            game_state['verticalLines'][(row, col)] = player

        boxes_completed = 0

        # Check boxes that this line affects
        if line_type == 'horizontal':
            # Check box above (if exists)
            if row > 0:
                if self._is_box_complete(game_state, row - 1, col):
                    game_state['boxes'][(row - 1, col)] = player
                    boxes_completed += 1
            # Check box below (if exists)
            if row < self.grid_size:
                if self._is_box_complete(game_state, row, col):
                    game_state['boxes'][(row, col)] = player
                    boxes_completed += 1
        else:  # vertical
            # Check box to the left (if exists)
            if col > 0:
                if self._is_box_complete(game_state, row, col - 1):
                    game_state['boxes'][(row, col - 1)] = player
                    boxes_completed += 1
            # Check box to the right (if exists)
            if col < self.grid_size:
                if self._is_box_complete(game_state, row, col):
                    game_state['boxes'][(row, col)] = player
                    boxes_completed += 1

        return boxes_completed

    def _is_box_complete(self, game_state: Dict[str, Any], row: int, col: int) -> bool:
        """Check if a box has all four sides"""
        top = (row, col) in game_state['horizontalLines']
        bottom = (row + 1, col) in game_state['horizontalLines']
        left = (row, col) in game_state['verticalLines']
        right = (row, col + 1) in game_state['verticalLines']
        return top and bottom and left and right

    def _get_ai_move(self, game_state: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Get AI move based on difficulty"""
        available_moves = self._get_available_moves(game_state)

        if not available_moves:
            return None

        if game_state['difficulty'] == 'easy':
            return random.choice(available_moves)

        elif game_state['difficulty'] == 'medium':
            # Try to complete a box
            for move in available_moves:
                if self._would_complete_box(game_state, move):
                    return move

            # Avoid giving opponent a box
            safe_moves = [m for m in available_moves if not self._would_give_box(game_state, m)]
            if safe_moves:
                return random.choice(safe_moves)

            return random.choice(available_moves)

        else:  # hard
            # Try to complete a box
            for move in available_moves:
                if self._would_complete_box(game_state, move):
                    return move

            # Avoid giving opponent a box
            safe_moves = [m for m in available_moves if not self._would_give_box(game_state, m)]
            if safe_moves:
                return random.choice(safe_moves)

            return random.choice(available_moves)

    def _get_available_moves(self, game_state: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Get all available moves"""
        moves = []

        # Horizontal lines
        for row in range(self.grid_size + 1):
            for col in range(self.grid_size):
                if (row, col) not in game_state['horizontalLines']:
                    moves.append({'type': 'horizontal', 'row': row, 'col': col})

        # Vertical lines
        for row in range(self.grid_size):
            for col in range(self.grid_size + 1):
                if (row, col) not in game_state['verticalLines']:
                    moves.append({'type': 'vertical', 'row': row, 'col': col})

        return moves

    def _would_complete_box(self, game_state: Dict[str, Any], move: Dict[str, Any]) -> bool:
        """Check if a move would complete a box"""
        temp_state = {
            'horizontalLines': game_state['horizontalLines'].copy(),
            'verticalLines': game_state['verticalLines'].copy()
        }

        if move['type'] == 'horizontal':
            temp_state['horizontalLines'][(move['row'], move['col'])] = 'test'
        else:
            temp_state['verticalLines'][(move['row'], move['col'])] = 'test'

        # Check affected boxes
        if move['type'] == 'horizontal':
            if move['row'] > 0:
                if self._is_box_complete(temp_state, move['row'] - 1, move['col']):
                    return True
            if move['row'] < self.grid_size:
                if self._is_box_complete(temp_state, move['row'], move['col']):
                    return True
        else:
            if move['col'] > 0:
                if self._is_box_complete(temp_state, move['row'], move['col'] - 1):
                    return True
            if move['col'] < self.grid_size:
                if self._is_box_complete(temp_state, move['row'], move['col']):
                    return True

        return False

    def _would_give_box(self, game_state: Dict[str, Any], move: Dict[str, Any]) -> bool:
        """Check if a move would allow opponent to complete a box"""
        # Check boxes that would have 3 sides after this move
        if move['type'] == 'horizontal':
            # Check box above
            if move['row'] > 0:
                if self._box_has_n_sides(game_state, move['row'] - 1, move['col'], 2):
                    return True
            # Check box below
            if move['row'] < self.grid_size:
                if self._box_has_n_sides(game_state, move['row'], move['col'], 2):
                    return True
        else:
            # Check box to left
            if move['col'] > 0:
                if self._box_has_n_sides(game_state, move['row'], move['col'] - 1, 2):
                    return True
            # Check box to right
            if move['col'] < self.grid_size:
                if self._box_has_n_sides(game_state, move['row'], move['col'], 2):
                    return True

        return False

    def _box_has_n_sides(self, game_state: Dict[str, Any], row: int, col: int, n: int) -> bool:
        """Check if a box has exactly n sides"""
        sides = 0
        if (row, col) in game_state['horizontalLines']:
            sides += 1
        if (row + 1, col) in game_state['horizontalLines']:
            sides += 1
        if (row, col) in game_state['verticalLines']:
            sides += 1
        if (row, col + 1) in game_state['verticalLines']:
            sides += 1
        return sides == n

    def _get_client_state(self, game_state: Dict[str, Any]) -> Dict[str, Any]:
        """Get state for client response"""
        return {
            'gridSize': game_state['gridSize'],
            'horizontalLines': {f"{k[0]},{k[1]}": v for k, v in game_state['horizontalLines'].items()},
            'verticalLines': {f"{k[0]},{k[1]}": v for k, v in game_state['verticalLines'].items()},
            'boxes': {f"{k[0]},{k[1]}": v for k, v in game_state['boxes'].items()},
            'currentPlayer': game_state['currentPlayer'],
            'playerScore': game_state['playerScore'],
            'aiScore': game_state['aiScore'],
            'gameOver': game_state['gameOver'],
            'winner': game_state['winner'],
            'moveCount': game_state['moveCount']
        }

    def _initialize_game_in_db(self, game_state: Dict[str, Any], user_id: int):
        """Initialize game record in database"""
        # TODO: Implement when database schema is ready
        pass

    def _complete_game_in_db(self, game_state: Dict[str, Any]):
        """Mark game as complete in database"""
        # TODO: Implement when database schema is ready
        if game_state['sessionId'] in self.sessions:
            del self.sessions[game_state['sessionId']]

# Global instance
dots_and_boxes_game = DotsAndBoxes(grid_size=4)