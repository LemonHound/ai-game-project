# Chess Model Inference Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Brian's chess CNN serve real moves through the existing game engine, behind the default-off `CHESS_AI_STRATEGY=model` flag, by loading a versioned ONNX artifact.

**Architecture:** A model artifact is a directory of `model.onnx` + `vocab.json` + `metadata.json`. At AI turn time, `ChessModelStrategy` reads the position as FEN, encodes it with the exact tensor layout the CNN was trained on, runs onnxruntime, masks the output to legal moves, and converts the chosen UCI move to the engine's move format. TensorFlow is used only on the training/producer side and never enters the serving image. The strategy is constructed at startup in `games.py` only when `CHESS_AI_STRATEGY=model`, so default behaviour is unchanged.

**Tech Stack:** Python 3.11, FastAPI, onnxruntime (serving), numpy, python-chess; TensorFlow + tf2onnx (producer only); pytest.

**Spec:** [2026-06-05-chess-model-inference-integration-design.md](../specs/2026-06-05-chess-model-inference-integration-design.md). **Program overview:** [chess-ml-adoption-overview.md](../specs/chess-ml-adoption-overview.md).

**Coverage note (no silent gaps):** Automated tests exercise the full inference path with a real onnxruntime session via a tiny committed fixture artifact (Task 7), plus pure-function unit tests. TensorFlow is never required in CI; the throwaway artifact and the manual verify script (Tasks 6 and 8) cover the TF producer path and are run locally, not in CI.

**Convention note:** This repo mandates Google-style docstrings on public functions and runs `pydocstyle`, which conflicts with the global "no docstrings" preference. Code below uses docstrings and no inline comments to keep CI green. Strip if directed.

---

## File map

| Path | Responsibility | Task |
|------|----------------|------|
| `requirements.in` / `requirements.txt` | Add serving deps: onnxruntime, numpy, chess | 1 |
| `requirements-train.in` / `requirements-train.txt` | Producer-only deps: tensorflow, tf2onnx, chess, numpy, tqdm | 1 |
| `src/backend/game_engine/chess_board_encoding.py` | `board_to_matrix`: position to 8x8x12 tensor (shared by serving and producer) | 2 |
| `src/backend/ml/artifact.py` | `ChessModelArtifact`, `validate_artifact`, `load_chess_model_artifact` | 3 |
| `src/backend/game_engine/chess_model_strategy.py` | `select_move` + rewritten `ChessModelStrategy` | 4, 5 |
| `scripts/train/produce_minimal_chess_artifact.py` | Throwaway artifact producer (TF + tf2onnx) | 6 |
| `scripts/train/sample_pgn/sample.pgn` | Tiny committed sample games for the producer | 6 |
| `tests/fixtures/chess_model_tiny/` | Committed tiny real artifact for integration tests | 6 |
| `scripts/verify_chess_model.py` | Manual "see it work" script (serving deps only) | 8 |
| `docker-compose.yml`, `src/backend/game_engine/INSTRUCTIONS.txt` | `CHESS_MODEL_DIR` config + corrected docs | 9 |
| `tests/unit/test_chess_board_encoding.py` | Encoding golden vectors | 2 |
| `tests/unit/test_ml_artifact.py` | Artifact validation + missing-dir | 3 |
| `tests/unit/test_chess_model_strategy.py` | select_move, uci roundtrip, generate_move with fake session | 4, 5 |
| `tests/unit/test_chess_model_artifact_integration.py` | Real onnxruntime via committed fixture | 7 |

---

## Task 1: Dependencies

**Files:**
- Modify: `requirements.in`
- Create: `requirements-train.in`
- Regenerate: `requirements.txt`, `requirements-train.txt`

- [ ] **Step 1: Add serving deps to `requirements.in`**

Add these three lines under a new section in `requirements.in`:

```
# ML serving
onnxruntime
numpy
chess
```

- [ ] **Step 2: Create `requirements-train.in`**

```
# Producer / training tooling — never installed into the serving image
tensorflow
tf2onnx
chess
numpy
tqdm
```

- [ ] **Step 3: Recompile both lockfiles**

Run:
```bash
python -m piptools compile requirements.in --output-file requirements.txt --strip-extras --upgrade
python -m piptools compile requirements-train.in --output-file requirements-train.txt --strip-extras
```
Expected: both `.txt` files regenerate with pinned versions, no errors.

- [ ] **Step 4: Install serving deps into the dev/test environment**

Run:
```bash
pip install -r requirements.txt
```
Expected: onnxruntime, numpy, chess install successfully.

- [ ] **Step 5: Commit**

```bash
git add requirements.in requirements.txt requirements-train.in requirements-train.txt
git commit -m "build: add onnxruntime/numpy/chess serving deps and train deps"
```

---

## Task 2: Board encoding module

**Files:**
- Create: `src/backend/game_engine/chess_board_encoding.py`
- Test: `tests/unit/test_chess_board_encoding.py`

- [ ] **Step 1: Write the failing test**

`tests/unit/test_chess_board_encoding.py`:
```python
import chess
import numpy as np
from game_engine.chess_board_encoding import board_to_matrix


def test_start_position_shape_and_count():
    matrix = board_to_matrix(chess.Board())
    assert matrix.shape == (8, 8, 12)
    assert matrix.dtype == np.float32
    assert matrix.sum() == 32


def test_start_position_white_pawns_channel_0_rank_2():
    matrix = board_to_matrix(chess.Board())
    for col in range(8):
        assert matrix[1, col, 0] == 1.0


def test_start_position_black_pawns_channel_6_rank_7():
    matrix = board_to_matrix(chess.Board())
    for col in range(8):
        assert matrix[6, col, 6] == 1.0


def test_start_position_white_rook_and_king_channels():
    matrix = board_to_matrix(chess.Board())
    assert matrix[0, 0, 3] == 1.0
    assert matrix[0, 4, 5] == 1.0


def test_after_e4_pawn_moves_to_e4_plane():
    board = chess.Board("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1")
    matrix = board_to_matrix(board)
    assert matrix[3, 4, 0] == 1.0
    assert matrix[1, 4, 0] == 0.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/unit/test_chess_board_encoding.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'game_engine.chess_board_encoding'`.

- [ ] **Step 3: Write minimal implementation**

`src/backend/game_engine/chess_board_encoding.py`:
```python
"""Board-to-tensor encoding for the chess CNN, ported verbatim from Brian's notebook."""
from __future__ import annotations

import numpy as np
from chess import Board


def board_to_matrix(board: Board) -> np.ndarray:
    """Encode a python-chess board as the 8x8x12 tensor the CNN was trained on.

    Channels 0-5 hold white piece types (pawn through king) and 6-11 hold black,
    using python-chess square indexing where divmod(square, 8) gives (rank, file).

    Args:
        board: A python-chess Board representing the position to encode.

    Returns:
        A float32 array of shape (8, 8, 12) with 1.0 at each occupied piece plane.
    """
    matrix = np.zeros((8, 8, 12), dtype=np.float32)
    for square, piece in board.piece_map().items():
        row, col = divmod(square, 8)
        piece_type = piece.piece_type - 1
        piece_color = 0 if piece.color else 6
        matrix[row, col, piece_type + piece_color] = 1.0
    return matrix
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/unit/test_chess_board_encoding.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/game_engine/chess_board_encoding.py tests/unit/test_chess_board_encoding.py
git commit -m "feat(chess): add board_to_matrix encoding for the CNN"
```

---

## Task 3: Artifact loader and validation

**Files:**
- Create: `src/backend/ml/artifact.py`
- Test: `tests/unit/test_ml_artifact.py`

- [ ] **Step 1: Write the failing test**

`tests/unit/test_ml_artifact.py`:
```python
import pytest
from ml.artifact import load_chess_model_artifact, validate_artifact


def test_validate_artifact_accepts_matching_counts():
    validate_artifact(2, {0: "e2e4", 1: "d2d4"}, {"class_count": 2})


def test_validate_artifact_rejects_mismatch():
    with pytest.raises(ValueError):
        validate_artifact(3, {0: "e2e4", 1: "d2d4"}, {"class_count": 2})


def test_load_missing_directory_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_chess_model_artifact(str(tmp_path / "does_not_exist"))


def test_load_missing_file_raises(tmp_path):
    (tmp_path / "vocab.json").write_text("{}", encoding="utf-8")
    with pytest.raises(FileNotFoundError):
        load_chess_model_artifact(str(tmp_path))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/unit/test_ml_artifact.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ml.artifact'`.

- [ ] **Step 3: Write minimal implementation**

`src/backend/ml/artifact.py`:
```python
"""Loading and validation for the chess model artifact (ONNX + vocab + metadata)."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

import onnxruntime as ort


@dataclass
class ChessModelArtifact:
    """A loaded chess model artifact ready for inference.

    Attributes:
        session: The onnxruntime inference session for model.onnx.
        int_to_uci: Mapping from output class index to UCI move string.
        metadata: Parsed metadata.json contents.
        input_name: Name of the session's single input tensor.
    """

    session: ort.InferenceSession
    int_to_uci: dict[int, str]
    metadata: dict[str, Any]
    input_name: str


def _output_dim(session: ort.InferenceSession) -> int:
    """Return the size of the model's final output dimension.

    Args:
        session: An onnxruntime inference session.

    Returns:
        The last dimension of the first output's shape, as an int.
    """
    shape = session.get_outputs()[0].shape
    return int(shape[-1])


def validate_artifact(
    output_dim: int, int_to_uci: dict[int, str], metadata: dict[str, Any]
) -> None:
    """Check that vocabulary, metadata, and model output agree on class count.

    Args:
        output_dim: The model's output dimension.
        int_to_uci: The loaded index-to-UCI vocabulary.
        metadata: The loaded metadata dict.

    Raises:
        ValueError: If the vocabulary length, metadata class_count, and output
            dimension are not all equal.
    """
    vocab_len = len(int_to_uci)
    class_count = metadata.get("class_count")
    if not (vocab_len == class_count == output_dim):
        raise ValueError(
            f"Artifact mismatch: vocab={vocab_len}, "
            f"metadata.class_count={class_count}, model_output={output_dim}"
        )


def load_chess_model_artifact(model_dir: str) -> ChessModelArtifact:
    """Load and validate a chess model artifact directory.

    The directory must contain model.onnx, vocab.json, and metadata.json.

    Args:
        model_dir: Path to the artifact directory.

    Returns:
        A validated ChessModelArtifact.

    Raises:
        FileNotFoundError: If the directory or any required file is missing.
        ValueError: If the artifact fails validation.
    """
    if not os.path.isdir(model_dir):
        raise FileNotFoundError(
            f"CHESS_MODEL_DIR not found or not a directory: {model_dir}"
        )
    onnx_path = os.path.join(model_dir, "model.onnx")
    vocab_path = os.path.join(model_dir, "vocab.json")
    metadata_path = os.path.join(model_dir, "metadata.json")
    for path in (onnx_path, vocab_path, metadata_path):
        if not os.path.isfile(path):
            raise FileNotFoundError(f"Missing artifact file: {path}")

    with open(vocab_path, "r", encoding="utf-8") as handle:
        raw_vocab = json.load(handle)
    int_to_uci = {int(key): value for key, value in raw_vocab.items()}

    with open(metadata_path, "r", encoding="utf-8") as handle:
        metadata = json.load(handle)

    session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    validate_artifact(_output_dim(session), int_to_uci, metadata)
    input_name = session.get_inputs()[0].name
    return ChessModelArtifact(
        session=session,
        int_to_uci=int_to_uci,
        metadata=metadata,
        input_name=input_name,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/unit/test_ml_artifact.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/ml/artifact.py tests/unit/test_ml_artifact.py
git commit -m "feat(ml): add chess model artifact loader and validation"
```

---

## Task 4: Move selection and UCI conversion helpers

**Files:**
- Modify: `src/backend/game_engine/chess_model_strategy.py` (add `select_move`; keep existing `uci_to_engine_move` / `engine_move_to_uci`)
- Test: `tests/unit/test_chess_model_strategy.py`

Note: the full strategy rewrite happens in Task 5. This task adds and tests the pure `select_move` function and the existing conversion helpers first.

- [ ] **Step 1: Write the failing test**

`tests/unit/test_chess_model_strategy.py`:
```python
import numpy as np
from game_engine.chess_model_strategy import (
    engine_move_to_uci,
    select_move,
    uci_to_engine_move,
)


def test_select_move_picks_highest_ranked_legal():
    predictions = np.array([0.1, 0.9, 0.5])
    int_to_uci = {0: "e2e4", 1: "d2d4", 2: "g1f3"}
    legal = {"e2e4", "g1f3"}
    assert select_move(predictions, int_to_uci, legal) == "g1f3"


def test_select_move_returns_none_when_no_legal_in_vocab():
    predictions = np.array([0.5, 0.5])
    int_to_uci = {0: "e2e4", 1: "d2d4"}
    legal = {"a2a3"}
    assert select_move(predictions, int_to_uci, legal) is None


def test_uci_engine_roundtrip():
    for uci in ["e2e4", "g1f3", "e7e8q", "a2a1q"]:
        assert engine_move_to_uci(uci_to_engine_move(uci)) == uci
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/unit/test_chess_model_strategy.py -v`
Expected: FAIL with `ImportError: cannot import name 'select_move'`.

- [ ] **Step 3: Add `select_move` to `chess_model_strategy.py`**

Add this function at module level in `src/backend/game_engine/chess_model_strategy.py` (the full file is rewritten in Task 5; for now just ensure `select_move`, `uci_to_engine_move`, and `engine_move_to_uci` are importable). Add the import `import numpy as np` at the top if absent, and insert:

```python
def select_move(
    predictions: "np.ndarray",
    int_to_uci: dict[int, str],
    legal_uci: set[str],
) -> Optional[str]:
    """Return the highest-scoring predicted move that is legal, or None.

    Args:
        predictions: 1-D array of class scores from the model.
        int_to_uci: Mapping from class index to UCI move string.
        legal_uci: Legal moves for the current position, in UCI form.

    Returns:
        The UCI string of the best legal move, or None if no legal move is in
        the model's vocabulary.
    """
    for index in np.argsort(predictions)[::-1]:
        uci = int_to_uci.get(int(index))
        if uci is not None and uci in legal_uci:
            return uci
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/unit/test_chess_model_strategy.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/game_engine/chess_model_strategy.py tests/unit/test_chess_model_strategy.py
git commit -m "feat(chess): add select_move legal-mask helper"
```

---

## Task 5: Rewrite ChessModelStrategy

**Files:**
- Modify: `src/backend/game_engine/chess_model_strategy.py` (full rewrite, preserving `uci_to_engine_move`, `engine_move_to_uci`, `select_move`)
- Test: `tests/unit/test_chess_model_strategy.py` (append generate_move tests)

- [ ] **Step 1: Append failing tests**

Append to `tests/unit/test_chess_model_strategy.py`:
```python
from game_engine.chess_engine import ChessEngine
from game_engine.chess_model_strategy import ChessModelStrategy
from ml.artifact import ChessModelArtifact


class _FakeSession:
    def __init__(self, predictions):
        self._predictions = np.asarray(predictions, dtype=np.float32)

    def get_inputs(self):
        return [type("Inp", (), {"name": "input"})()]

    def run(self, output_names, feed):
        return [self._predictions.reshape(1, -1)]


def _artifact(predictions, int_to_uci):
    return ChessModelArtifact(
        session=_FakeSession(predictions),
        int_to_uci=int_to_uci,
        metadata={"class_count": len(int_to_uci)},
        input_name="input",
    )


def _ai_start_state():
    return {**ChessEngine().initial_state(player_starts=False), "current_turn": "ai"}


def test_generate_move_returns_model_choice():
    artifact = _artifact([1.0, 0.0], {0: "e2e4", 1: "d2d4"})
    strategy = ChessModelStrategy(artifact=artifact)
    move, score = strategy.generate_move(_ai_start_state())
    assert move == {
        "fromRow": 6,
        "fromCol": 4,
        "toRow": 4,
        "toCol": 4,
        "promotionPiece": None,
    }
    assert score is None


def test_generate_move_falls_back_to_legal_when_vocab_has_no_legal_move():
    artifact = _artifact([1.0], {0: "a1a2"})
    strategy = ChessModelStrategy(artifact=artifact)
    state = _ai_start_state()
    move, score = strategy.generate_move(state)
    legal = ChessEngine().get_legal_moves(state)
    assert move in legal
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/unit/test_chess_model_strategy.py -v`
Expected: FAIL — `ChessModelStrategy.__init__` does not accept an `artifact` argument and still raises `NotImplementedError`.

- [ ] **Step 3: Rewrite `chess_model_strategy.py`**

Replace the entire contents of `src/backend/game_engine/chess_model_strategy.py` with:
```python
"""ML chess strategy: runs Brian's CNN, served as an ONNX artifact, to pick moves.

Active only when CHESS_AI_STRATEGY=model. The artifact directory is given by
CHESS_MODEL_DIR and must contain model.onnx, vocab.json, and metadata.json.
"""
from __future__ import annotations

import logging
import os
import random
from typing import Optional

import numpy as np
from chess import Board

from game_engine.base import AIStrategy, GameState, Move
from game_engine.chess_board_encoding import board_to_matrix
from game_engine.chess_engine import ChessEngine
from ml.artifact import ChessModelArtifact, load_chess_model_artifact

logger = logging.getLogger(__name__)

_FILES = "abcdefgh"
_MODEL_DIR_ENV = "CHESS_MODEL_DIR"
_DEFAULT_MODEL_DIR = "/app/model_weights/chess"


def uci_to_engine_move(uci: str) -> Move:
    """Convert a UCI move string to the engine's move dict format.

    The engine uses row 0 = rank 8, row 7 = rank 1, col 0 = a-file, col 7 = h-file.

    Args:
        uci: UCI move string, e.g. "e2e4" or "e7e8q" (with promotion).

    Returns:
        Dict with fromRow, fromCol, toRow, toCol, promotionPiece.

    Raises:
        ValueError: If the UCI string is malformed.
    """
    if len(uci) < 4 or len(uci) > 5:
        raise ValueError(f"Invalid UCI move length: {uci!r}")

    from_file = uci[0]
    from_rank = uci[1]
    to_file = uci[2]
    to_rank = uci[3]

    if from_file not in _FILES or to_file not in _FILES:
        raise ValueError(f"Invalid file in UCI move: {uci!r}")
    if from_rank not in "12345678" or to_rank not in "12345678":
        raise ValueError(f"Invalid rank in UCI move: {uci!r}")

    from_col = _FILES.index(from_file)
    from_row = 8 - int(from_rank)
    to_col = _FILES.index(to_file)
    to_row = 8 - int(to_rank)

    promotion = None
    if len(uci) == 5:
        promo_char = uci[4].lower()
        if promo_char not in "qrbn":
            raise ValueError(f"Invalid promotion piece in UCI move: {uci!r}")
        promotion = promo_char.upper() if to_row == 0 else promo_char

    return {
        "fromRow": from_row,
        "fromCol": from_col,
        "toRow": to_row,
        "toCol": to_col,
        "promotionPiece": promotion,
    }


def engine_move_to_uci(move: Move) -> str:
    """Convert an engine move dict to a UCI string.

    Args:
        move: Dict with fromRow, fromCol, toRow, toCol, and optional promotionPiece.

    Returns:
        UCI string, e.g. "e2e4" or "e7e8q".
    """
    from_file = _FILES[move["fromCol"]]
    from_rank = 8 - move["fromRow"]
    to_file = _FILES[move["toCol"]]
    to_rank = 8 - move["toRow"]
    uci = f"{from_file}{from_rank}{to_file}{to_rank}"
    if move.get("promotionPiece"):
        uci += move["promotionPiece"].lower()
    return uci


def select_move(
    predictions: np.ndarray,
    int_to_uci: dict[int, str],
    legal_uci: set[str],
) -> Optional[str]:
    """Return the highest-scoring predicted move that is legal, or None.

    Args:
        predictions: 1-D array of class scores from the model.
        int_to_uci: Mapping from class index to UCI move string.
        legal_uci: Legal moves for the current position, in UCI form.

    Returns:
        The UCI string of the best legal move, or None if no legal move is in
        the model's vocabulary.
    """
    for index in np.argsort(predictions)[::-1]:
        uci = int_to_uci.get(int(index))
        if uci is not None and uci in legal_uci:
            return uci
    return None


class ChessModelStrategy(AIStrategy):
    """AIStrategy that selects moves with Brian's CNN served as an ONNX artifact."""

    def __init__(self, artifact: Optional[ChessModelArtifact] = None) -> None:
        """Load the model artifact (from CHESS_MODEL_DIR unless one is injected).

        Args:
            artifact: A preloaded artifact, used by tests. When None, the artifact
                is loaded from the directory named by CHESS_MODEL_DIR at startup.
        """
        if artifact is None:
            model_dir = os.getenv(_MODEL_DIR_ENV, _DEFAULT_MODEL_DIR)
            logger.info("chess_model_strategy_init", extra={"model_dir": model_dir})
            artifact = load_chess_model_artifact(model_dir)
        self._artifact = artifact
        self._engine = ChessEngine()

    def set_move_history(self, algebraic_moves: list[str]) -> None:
        """Accept the SAN move history for interface compatibility (unused).

        The model reads the board from the current FEN, so move history is not
        needed. Retained because the game router calls this before each AI turn.

        Args:
            algebraic_moves: Ordered SAN move strings; ignored.
        """
        return None

    def _predict(self, fen: str) -> Optional[str]:
        """Run the model on a FEN and return the best legal UCI move, or None.

        Args:
            fen: FEN string of the position to move from.

        Returns:
            UCI move string, or None if no legal move is in the vocabulary.
        """
        board = Board(fen)
        legal_uci = {move.uci() for move in board.legal_moves}
        if not legal_uci:
            return None
        model_input = np.expand_dims(board_to_matrix(board), axis=0)
        outputs = self._artifact.session.run(
            None, {self._artifact.input_name: model_input}
        )
        predictions = np.asarray(outputs[0]).reshape(-1)
        return select_move(predictions, self._artifact.int_to_uci, legal_uci)

    def generate_move(self, state: GameState) -> tuple[Move, Optional[float]]:
        """Generate a move for the current state using the model.

        Reads the position as FEN, asks the model for a legal move, and converts
        it to the engine move format. Falls back to a random legal move if the
        model declines or anything goes wrong, so a valid move is always returned.

        Args:
            state: Current game state dict with current_turn set to "ai".

        Returns:
            Tuple of (engine_move_dict, None).
        """
        try:
            fen = self._engine.get_state_fen(state)
            uci = self._predict(fen)
            if uci is not None:
                return uci_to_engine_move(uci), None
            logger.warning("chess_model_no_vocab_move", extra={"fen": fen})
        except Exception:
            logger.exception("chess_model_predict_failed")
        legal = self._engine.get_legal_moves(state)
        return random.choice(legal), None
```

- [ ] **Step 4: Run the full strategy test file**

Run: `python -m pytest tests/unit/test_chess_model_strategy.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the chess regression suite to confirm nothing broke**

Run: `python -m pytest tests/unit/ -k chess -v`
Expected: PASS (existing chess engine/logic/pgn tests plus the new ones).

- [ ] **Step 6: Commit**

```bash
git add src/backend/game_engine/chess_model_strategy.py tests/unit/test_chess_model_strategy.py
git commit -m "feat(chess): serve CNN moves via ONNX in ChessModelStrategy"
```

---

## Task 6: Minimal artifact producer and committed fixture

**Files:**
- Create: `scripts/train/sample_pgn/sample.pgn`
- Create: `scripts/train/produce_minimal_chess_artifact.py`
- Create (generated, committed): `tests/fixtures/chess_model_tiny/{model.onnx,vocab.json,metadata.json}`

This task uses the producer (TF + tf2onnx) and is run locally, not in CI. Install train deps first in a separate environment: `pip install -r requirements-train.txt`.

- [ ] **Step 1: Create the sample PGN**

`scripts/train/sample_pgn/sample.pgn`:
```
[Event "Sample"]
[Site "?"]
[Date "????.??.??"]
[Round "?"]
[White "A"]
[Black "B"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 1-0

[Event "Sample"]
[Site "?"]
[Date "????.??.??"]
[Round "?"]
[White "C"]
[Black "D"]
[Result "1/2-1/2"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 1/2-1/2
```

- [ ] **Step 2: Write the producer**

`scripts/train/produce_minimal_chess_artifact.py`:
```python
"""Produce a throwaway chess model artifact (model.onnx + vocab.json + metadata.json).

Trains a tiny CNN on a few sample games purely to exercise the serving path.
Superseded by sub-project D's reproducible pipeline. Run with the train deps:
    pip install -r requirements-train.txt
    python scripts/train/produce_minimal_chess_artifact.py --out model_weights/chess
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
import tensorflow as tf
import tf2onnx
from chess import Board, pgn

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src", "backend"))
from game_engine.chess_board_encoding import board_to_matrix


def load_games(pgn_dir: str) -> list:
    """Load every game from every .pgn file in a directory.

    Args:
        pgn_dir: Directory containing .pgn files.

    Returns:
        A list of python-chess Game objects.
    """
    games = []
    for name in sorted(os.listdir(pgn_dir)):
        if not name.endswith(".pgn"):
            continue
        with open(os.path.join(pgn_dir, name), "r", encoding="utf-8") as handle:
            while True:
                game = pgn.read_game(handle)
                if game is None:
                    break
                games.append(game)
    return games


def build_examples(games: list) -> tuple[list, list]:
    """Build (board_tensor, uci_move) training pairs from games.

    Args:
        games: List of python-chess Game objects.

    Returns:
        Tuple of (X list of tensors, y list of UCI strings).
    """
    features = []
    labels = []
    for game in games:
        board = game.board()
        for move in game.mainline_moves():
            features.append(board_to_matrix(board))
            labels.append(move.uci())
            board.push(move)
    return features, labels


def build_vocab(ucis: list) -> dict:
    """Build a deterministic sorted UCI-to-index vocabulary.

    Args:
        ucis: All UCI move strings observed in training.

    Returns:
        Dict mapping UCI string to integer index.
    """
    return {uci: index for index, uci in enumerate(sorted(set(ucis)))}


def build_model(class_count: int) -> tf.keras.Model:
    """Build Brian's CNN architecture for the given output size.

    Args:
        class_count: Number of distinct UCI moves (output classes).

    Returns:
        A compiled Keras model.
    """
    model = tf.keras.models.Sequential(
        [
            tf.keras.layers.Conv2D(64, (3, 3), activation="relu", input_shape=(8, 8, 12)),
            tf.keras.layers.Conv2D(128, (3, 3), activation="relu"),
            tf.keras.layers.Flatten(),
            tf.keras.layers.Dense(256, activation="relu"),
            tf.keras.layers.Dense(class_count, activation="softmax"),
        ]
    )
    model.compile(
        optimizer=tf.keras.optimizers.Adam(),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def main() -> None:
    """Train a tiny model and write the artifact directory."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument(
        "--pgn-dir",
        default=os.path.join(os.path.dirname(__file__), "sample_pgn"),
    )
    parser.add_argument("--epochs", type=int, default=10)
    args = parser.parse_args()

    games = load_games(args.pgn_dir)
    features, labels = build_examples(games)
    vocab = build_vocab(labels)
    class_count = len(vocab)

    x = np.array(features, dtype=np.float32)
    y = tf.keras.utils.to_categorical([vocab[u] for u in labels], num_classes=class_count)

    model = build_model(class_count)
    model.fit(x, y, epochs=args.epochs, batch_size=16, verbose=2)

    os.makedirs(args.out, exist_ok=True)
    spec = (tf.TensorSpec((None, 8, 8, 12), tf.float32, name="input"),)
    tf2onnx.convert.from_keras(
        model, input_signature=spec, output_path=os.path.join(args.out, "model.onnx")
    )

    int_to_uci = {str(index): uci for uci, index in vocab.items()}
    with open(os.path.join(args.out, "vocab.json"), "w", encoding="utf-8") as handle:
        json.dump(int_to_uci, handle, indent=2)

    metadata = {
        "schema_version": 1,
        "class_count": class_count,
        "input_shape": [8, 8, 12],
        "source_notebook_commit": "minimal-producer",
        "dataset_manifest_id": None,
        "created_at": None,
        "content_hash": None,
    }
    with open(os.path.join(args.out, "metadata.json"), "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    print(f"Wrote artifact with {class_count} classes to {args.out}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Generate the dev artifact and the committed test fixture**

Run (in the train environment):
```bash
python scripts/train/produce_minimal_chess_artifact.py --out model_weights/chess --epochs 10
python scripts/train/produce_minimal_chess_artifact.py --out tests/fixtures/chess_model_tiny --epochs 1
```
Expected: each command prints `Wrote artifact with N classes to ...` and creates `model.onnx`, `vocab.json`, `metadata.json`.

- [ ] **Step 4: Confirm the fixture is tiny and loadable with serving deps only**

Run (in the serving environment, no TensorFlow):
```bash
python -c "from ml.artifact import load_chess_model_artifact as L; a=L('tests/fixtures/chess_model_tiny'); print(len(a.int_to_uci), a.input_name)"
```
Expected: prints the class count and `input`, with no errors.

- [ ] **Step 5: Commit the producer, sample, and fixture (not the dev artifact)**

Add `model_weights/` to `.gitignore` if not already ignored, then:
```bash
git add scripts/train/sample_pgn/sample.pgn scripts/train/produce_minimal_chess_artifact.py tests/fixtures/chess_model_tiny .gitignore
git commit -m "feat(train): add minimal chess artifact producer and test fixture"
```

---

## Task 7: Real-onnxruntime integration test

**Files:**
- Test: `tests/unit/test_chess_model_artifact_integration.py`

- [ ] **Step 1: Write the test**

`tests/unit/test_chess_model_artifact_integration.py`:
```python
import os

from game_engine.chess_engine import ChessEngine
from game_engine.chess_model_strategy import ChessModelStrategy
from ml.artifact import load_chess_model_artifact

_FIXTURE = os.path.join(os.path.dirname(__file__), "..", "fixtures", "chess_model_tiny")


def test_fixture_artifact_loads_and_validates():
    artifact = load_chess_model_artifact(_FIXTURE)
    assert len(artifact.int_to_uci) == artifact.metadata["class_count"]
    assert artifact.input_name == "input"


def test_fixture_strategy_returns_legal_move_for_start_position():
    artifact = load_chess_model_artifact(_FIXTURE)
    strategy = ChessModelStrategy(artifact=artifact)
    engine = ChessEngine()
    state = {**engine.initial_state(player_starts=False), "current_turn": "ai"}
    move, _ = strategy.generate_move(state)
    assert move in engine.get_legal_moves(state)
```

- [ ] **Step 2: Run the test**

Run: `python -m pytest tests/unit/test_chess_model_artifact_integration.py -v`
Expected: PASS (2 tests), exercising a real onnxruntime session on the committed fixture.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/test_chess_model_artifact_integration.py
git commit -m "test(chess): integration test for model artifact via onnxruntime"
```

---

## Task 8: Manual verify script

**Files:**
- Create: `scripts/verify_chess_model.py`

- [ ] **Step 1: Write the script**

`scripts/verify_chess_model.py`:
```python
"""Load a chess model artifact and print a predicted move. Serving deps only.

Usage:
    CHESS_MODEL_DIR=model_weights/chess python scripts/verify_chess_model.py
    python scripts/verify_chess_model.py --model-dir tests/fixtures/chess_model_tiny
    python scripts/verify_chess_model.py --fen "<FEN>"
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "backend"))
from game_engine.chess_engine import ChessEngine
from game_engine.chess_model_strategy import ChessModelStrategy
from ml.artifact import load_chess_model_artifact


def main() -> None:
    """Print the model's chosen move for a FEN or the opening position."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model-dir", default=os.getenv("CHESS_MODEL_DIR", "model_weights/chess")
    )
    parser.add_argument("--fen", default=None)
    args = parser.parse_args()

    artifact = load_chess_model_artifact(args.model_dir)
    strategy = ChessModelStrategy(artifact=artifact)

    if args.fen:
        print("predicted uci:", strategy._predict(args.fen))
        return
    engine = ChessEngine()
    state = {**engine.initial_state(player_starts=False), "current_turn": "ai"}
    move, _ = strategy.generate_move(state)
    print("engine move:", move)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it against the fixture**

Run: `python scripts/verify_chess_model.py --model-dir tests/fixtures/chess_model_tiny`
Expected: prints `engine move: {...}` with a legal move dict.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify_chess_model.py
git commit -m "feat(chess): add manual model verification script"
```

---

## Task 9: Config and docs

**Files:**
- Modify: `docker-compose.yml`
- Modify: `src/backend/game_engine/INSTRUCTIONS.txt`

- [ ] **Step 1: Point docker-compose at the artifact directory**

In `docker-compose.yml`, under the app service environment, change the chess model path variable from `CHESS_MODEL_PATH` (file) to `CHESS_MODEL_DIR` (directory). Set:
```yaml
      CHESS_AI_STRATEGY: ${CHESS_AI_STRATEGY:-minimax}
      CHESS_MODEL_DIR: /app/model_weights/chess
```
And update the commented model-weights volume mount to mount a directory:
```yaml
    # volumes:
    #   - ./model_weights/chess:/app/model_weights/chess
```

- [ ] **Step 2: Correct the model-integration sections of INSTRUCTIONS.txt**

In `src/backend/game_engine/INSTRUCTIONS.txt`, update sections 4, 7, and 11 to describe the ONNX artifact directory contract instead of a single PyTorch `.pt` file:
- The model is an artifact directory (`model.onnx` + `vocab.json` + `metadata.json`).
- `_predict` takes a FEN-derived board tensor, not a PGN string.
- The env var is `CHESS_MODEL_DIR` (directory), default `/app/model_weights/chess`.
- Dependencies for serving are onnxruntime + numpy + chess; TensorFlow is producer-only.

- [ ] **Step 3: Run the fast test suite**

Run: `npm run test:fast`
Expected: Vitest + pytest unit + lint pass, including the new chess model tests.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml src/backend/game_engine/INSTRUCTIONS.txt
git commit -m "docs(chess): switch config/docs to CHESS_MODEL_DIR ONNX artifact"
```

---

## Self-review

**Spec coverage:**
- Artifact contract (spec 3) → Tasks 3, 6.
- Board encoding (spec 4.1) → Task 2.
- Artifact loader (spec 4.2) → Task 3.
- Strategy rewrite (spec 4.3) → Tasks 4, 5.
- Configuration (spec 4.4) → Task 9 (games.py needs no change; it already constructs `ChessModelStrategy()` which now loads from `CHESS_MODEL_DIR`).
- Minimal artifact producer (spec 4.5) → Task 6.
- Verify script (spec 4.6) → Task 8.
- Dependencies split (spec 5) → Task 1.
- Failure modes (spec 7): missing artifact → Task 3 tests; no legal move in vocab → Task 5 test; predict error → generate_move try/except in Task 5.
- Reversibility (spec 8): flag default `minimax`, additive code, deletable fixture/artifact — preserved; no destructive steps.
- Test Cases table (spec 9): board encoding (Task 2), select/mask (Task 4), no-legal-move (Task 5), uci roundtrip (Task 4), dimension mismatch (Task 3), fixture predicts legal (Task 7), missing artifact (Task 3).

**Placeholder scan:** No TBD/TODO; all code blocks complete.

**Type consistency:** `ChessModelArtifact(session, int_to_uci, metadata, input_name)` constructed identically in Tasks 3, 5 (tests), 7. `select_move(predictions, int_to_uci, legal_uci)` signature consistent across Tasks 4 and 5. `load_chess_model_artifact(model_dir)` used identically in Tasks 3, 6, 7, 8.

**Known minor edge (acceptable for A):** if the model selects an underpromotion the engine does not generate, `validate_move` rejects it and `MoveProcessor` retries then plays a random legal move. Logged, non-fatal.
