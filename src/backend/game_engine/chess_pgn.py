"""PGN (Portable Game Notation) generation from algebraic move lists."""
import logging
from datetime import date
from typing import Optional

logger = logging.getLogger(__name__)

_DEFAULT_EVENT = "AI Game Website"


def moves_to_pgn(
    algebraic_moves: list[str],
    white_name: str = "Player",
    black_name: str = "AI",
    result: Optional[str] = None,
    event: str = _DEFAULT_EVENT,
    game_date: Optional[date] = None,
) -> str:
    """Build a PGN string from a list of SAN moves.

    Args:
        algebraic_moves: Ordered list of SAN move strings (e.g. ["e4", "e5", "Nf3"]).
            Sourced from chess_games.move_list_algebraic in the database.
        white_name: Name for the White player header.
        black_name: Name for the Black player header.
        result: One of "1-0", "0-1", "1/2-1/2", or None for an in-progress game.
            When None the result header is set to "*" (ongoing).
        event: Event header value.
        game_date: Date for the Date header. Defaults to today.

    Returns:
        A PGN-formatted string with standard seven-tag roster and numbered move text.
    """
    pgn_result = result if result in ("1-0", "0-1", "1/2-1/2") else "*"
    pgn_date = (game_date or date.today()).strftime("%Y.%m.%d")

    headers = [
        f'[Event "{event}"]',
        '[Site "localhost"]',
        f'[Date "{pgn_date}"]',
        '[Round "-"]',
        f'[White "{white_name}"]',
        f'[Black "{black_name}"]',
        f'[Result "{pgn_result}"]',
    ]

    move_tokens: list[str] = []
    for i, san in enumerate(algebraic_moves):
        if i % 2 == 0:
            move_number = (i // 2) + 1
            move_tokens.append(f"{move_number}.")
        move_tokens.append(san)

    move_text = " ".join(move_tokens)
    if move_text:
        move_text += f" {pgn_result}"
    else:
        move_text = pgn_result

    return "\n".join(headers) + "\n\n" + move_text + "\n"


def outcome_to_pgn_result(outcome: Optional[str], player_color: str) -> Optional[str]:
    """Convert an engine outcome string to a PGN result token.

    Args:
        outcome: One of "player_won", "ai_won", "draw", or None.
        player_color: "white" or "black" -- the color the human player controls.

    Returns:
        "1-0", "0-1", "1/2-1/2", or None (game still in progress).
    """
    if outcome is None:
        return None
    if outcome == "draw":
        return "1/2-1/2"
    if outcome == "player_won":
        return "1-0" if player_color == "white" else "0-1"
    if outcome == "ai_won":
        return "0-1" if player_color == "white" else "1-0"
    return None
