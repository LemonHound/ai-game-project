from game_engine.chess_engine import ChessEngine


def test_chess_initial_state_has_startpos_fen():
    state = ChessEngine().initial_state(player_starts=True)
    fields = state["fen"].split(" ")
    assert fields[0] == "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
    assert fields[1] == "w"


def test_chess_state_payload_includes_fen():
    import games

    state = ChessEngine().initial_state(player_starts=True)
    payload = games._chess_state_payload(state)
    assert payload["fen"] == state["fen"]
