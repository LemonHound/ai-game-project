"""Tests for PGN generation utility."""
from datetime import date

from game_engine.chess_pgn import moves_to_pgn, outcome_to_pgn_result


def _header_block(
    white="Player",
    black="AI",
    result="*",
    dt="2025.01.01",
    event="AI Game Website",
):
    return (
        f'[Event "{event}"]\n'
        f'[Site "localhost"]\n'
        f'[Date "{dt}"]\n'
        f'[Round "-"]\n'
        f'[White "{white}"]\n'
        f'[Black "{black}"]\n'
        f'[Result "{result}"]'
    )


FIXED_DATE = date(2025, 1, 1)


class TestMovesToPgn:
    def test_empty_game(self):
        pgn = moves_to_pgn([], game_date=FIXED_DATE)
        assert pgn == _header_block() + "\n\n*\n"

    def test_single_move(self):
        pgn = moves_to_pgn(["e4"], game_date=FIXED_DATE)
        assert pgn == _header_block() + "\n\n1. e4 *\n"

    def test_two_moves(self):
        pgn = moves_to_pgn(["e4", "e5"], game_date=FIXED_DATE)
        assert pgn == _header_block() + "\n\n1. e4 e5 *\n"

    def test_three_moves(self):
        pgn = moves_to_pgn(["e4", "e5", "Nf3"], game_date=FIXED_DATE)
        assert pgn == _header_block() + "\n\n1. e4 e5 2. Nf3 *\n"

    def test_full_scholars_mate(self):
        moves = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]
        pgn = moves_to_pgn(moves, result="1-0", game_date=FIXED_DATE)
        expected_moves = "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0"
        assert pgn == _header_block(result="1-0") + "\n\n" + expected_moves + "\n"

    def test_castling_notation_passes_through(self):
        moves = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"]
        pgn = moves_to_pgn(moves, game_date=FIXED_DATE)
        assert "O-O" in pgn

    def test_promotion_notation_passes_through(self):
        moves = ["e4", "d5", "exd5", "c6", "dxc6", "Nf6", "c7", "Qd5", "c8=Q+"]
        pgn = moves_to_pgn(moves, game_date=FIXED_DATE)
        assert "c8=Q+" in pgn

    def test_en_passant_capture_notation_passes_through(self):
        moves = ["e4", "d5", "e5", "f5", "exf6"]
        pgn = moves_to_pgn(moves, game_date=FIXED_DATE)
        assert "exf6" in pgn

    def test_custom_names(self):
        pgn = moves_to_pgn(["e4"], white_name="Alice", black_name="Bob", game_date=FIXED_DATE)
        assert '[White "Alice"]' in pgn
        assert '[Black "Bob"]' in pgn

    def test_result_white_wins(self):
        pgn = moves_to_pgn(["e4"], result="1-0", game_date=FIXED_DATE)
        assert '[Result "1-0"]' in pgn
        assert pgn.endswith("1-0\n")

    def test_result_black_wins(self):
        pgn = moves_to_pgn(["e4", "e5"], result="0-1", game_date=FIXED_DATE)
        assert '[Result "0-1"]' in pgn
        assert pgn.endswith("0-1\n")

    def test_result_draw(self):
        pgn = moves_to_pgn(["e4", "e5"], result="1/2-1/2", game_date=FIXED_DATE)
        assert '[Result "1/2-1/2"]' in pgn
        assert pgn.endswith("1/2-1/2\n")

    def test_invalid_result_defaults_to_star(self):
        pgn = moves_to_pgn(["e4"], result="invalid", game_date=FIXED_DATE)
        assert '[Result "*"]' in pgn

    def test_move_numbering_long_game(self):
        moves = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7"]
        pgn = moves_to_pgn(moves, game_date=FIXED_DATE)
        assert "1. e4 e5" in pgn
        assert "2. Nf3 Nc6" in pgn
        assert "3. Bb5 a6" in pgn
        assert "4. Ba4 Nf6" in pgn
        assert "5. O-O Be7" in pgn


def test_chess_pgn_regenerated_from_moves():
    moves = ["e4", "e5", "Nf3", "Nc6", "Bb5"]
    pgn = moves_to_pgn(
        moves,
        white_name="Alice",
        black_name="AI",
        result="*",
        game_date=FIXED_DATE,
    )
    assert '[White "Alice"]' in pgn
    assert '[Black "AI"]' in pgn
    assert "1. e4 e5" in pgn
    assert "2. Nf3 Nc6" in pgn
    assert "3. Bb5" in pgn
    assert "[Result" in pgn


class TestOutcomeToPgnResult:
    def test_player_won_as_white(self):
        assert outcome_to_pgn_result("player_won", "white") == "1-0"

    def test_player_won_as_black(self):
        assert outcome_to_pgn_result("player_won", "black") == "0-1"

    def test_ai_won_vs_white_player(self):
        assert outcome_to_pgn_result("ai_won", "white") == "0-1"

    def test_ai_won_vs_black_player(self):
        assert outcome_to_pgn_result("ai_won", "black") == "1-0"

    def test_draw(self):
        assert outcome_to_pgn_result("draw", "white") == "1/2-1/2"
        assert outcome_to_pgn_result("draw", "black") == "1/2-1/2"

    def test_none_outcome(self):
        assert outcome_to_pgn_result(None, "white") is None

    def test_unknown_outcome(self):
        assert outcome_to_pgn_result("unknown", "white") is None
