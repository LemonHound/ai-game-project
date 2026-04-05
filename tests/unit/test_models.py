import pytest
from pydantic import ValidationError

from models import (
    C4MoveRequest,
    C4NewGameRequest,
    CheckersMoveRequest,
    CheckersNewGameRequest,
    ChessMoveRequest,
    ChessNewGameRequest,
    DaBMoveRequest,
    DaBNewGameRequest,
    GameInfo,
    MoveRequest,
    TttMoveRequest,
    TttNewGameRequest,
)


def test_pydantic_move_request_accepts_valid():
    req = MoveRequest(gameSessionId="abc-123", move={"position": 4})
    assert req.gameSessionId == "abc-123"
    assert req.move == {"position": 4}


def test_pydantic_move_request_rejects_missing_fields():
    with pytest.raises(ValidationError):
        MoveRequest(move={"position": 4})
    with pytest.raises(ValidationError):
        MoveRequest(gameSessionId="abc-123")


def test_ttt_new_game_defaults():
    req = TttNewGameRequest()
    assert req.player_starts is True


def test_ttt_move_request_valid():
    req = TttMoveRequest(position=4)
    assert req.position == 4


def test_ttt_move_request_rejects_missing():
    with pytest.raises(ValidationError):
        TttMoveRequest()


def test_c4_move_request_valid():
    req = C4MoveRequest(col=3)
    assert req.col == 3


def test_checkers_move_request_valid():
    req = CheckersMoveRequest(from_pos=40, to_pos=33)
    assert req.from_pos == 40
    assert req.to_pos == 33


def test_checkers_move_request_rejects_missing():
    with pytest.raises(ValidationError):
        CheckersMoveRequest(from_pos=40)


def test_dab_move_request_valid():
    req = DaBMoveRequest(type="horizontal", row=0, col=0)
    assert req.type == "horizontal"


def test_dab_move_request_rejects_missing():
    with pytest.raises(ValidationError):
        DaBMoveRequest(type="horizontal", row=0)


def test_chess_move_request_valid():
    req = ChessMoveRequest(fromRow=6, fromCol=4, toRow=4, toCol=4)
    assert req.fromRow == 6
    assert req.promotionPiece is None


def test_chess_move_request_with_promotion():
    req = ChessMoveRequest(fromRow=1, fromCol=0, toRow=0, toCol=0, promotionPiece="Q")
    assert req.promotionPiece == "Q"


def test_game_info_valid():
    info = GameInfo(
        id="ttt",
        name="Tic-Tac-Toe",
        description="Classic game",
        icon="grid",
        difficulty="easy",
        players=2,
        status="active",
        category="strategy",
        tags=["classic", "quick"],
    )
    assert info.id == "ttt"
    assert info.tags == ["classic", "quick"]


def test_game_info_rejects_missing():
    with pytest.raises(ValidationError):
        GameInfo(id="ttt", name="Tic-Tac-Toe")
