# Chess Model Inference Integration (Sub-project A)

Status: Draft for review
Date: 2026-06-05
Owner: Kevin (engineering)

## 1. Scope and where this fits

This is the phase A spec within the Chess ML Adoption program. For the overall milestone, the two-project architecture, the artifact-contract seam, and the full phase sequence and status, see the program overview: [chess-ml-adoption-overview.md](chess-ml-adoption-overview.md).

Phase A scope: make one model artifact serve moves through the existing chess engine, behind the default-off `CHESS_AI_STRATEGY=model` flag, running against a throwaway minimal artifact. Model strength, training, data infrastructure, the lookahead search, and the value network are out of scope here and owned by other phases (B, C, D, and later hub items), as tracked in the overview.

## 2. Goal and non-goals

Goal: when `CHESS_AI_STRATEGY=model`, the chess AI generates moves by running Brian's model (as an ONNX artifact) instead of minimax, end to end, in real games.

Non-goals: model quality or strength, reproducible or large-scale training data, cloud artifact delivery, continued learning, the lookahead search. A runs against a throwaway minimal artifact.

## 3. The model artifact contract

An artifact is a directory containing three files:

- `model.onnx`: the network converted from Keras. Input shape `(1, 8, 8, 12)`; output a softmax vector of length N (the class count).
- `vocab.json`: maps class index (as string) to UCI move string; length N. This is the decoder the notebook never saves.
- `metadata.json`: provenance and validation:
  - `schema_version`
  - `class_count` (N)
  - `input_shape`
  - `source_notebook_commit`
  - `dataset_manifest_id` (null for the minimal artifact)
  - `created_at`
  - `content_hash` (hash over `model.onnx` plus `vocab.json`)

Loaders depend only on this contract, so B, C, and D may evolve freely as long as they emit this shape.

## 4. Components

All serving components live in the AI Game Hub backend.

### 4.1 Board encoding (correctness-critical)

- New module `src/backend/game_engine/chess_board_encoding.py`.
- Ports Brian's `board_to_matrix` verbatim: an 8x8x12 float array, square index via python-chess `divmod(square, 8)` giving `(row=rank, col=file)`, white piece types in channels 0 to 5, black in channels 6 to 11.
- Input path: engine state to FEN (via the existing `get_state_fen`) to `chess.Board(fen)` to `board_to_matrix`.
- We do NOT reuse the engine's own board array, whose row/col convention (row 0 = rank 8) differs from python-chess and would scramble the model's input.

### 4.2 Artifact loader

- New module `src/backend/ml/artifact.py`: given a directory, build the `onnxruntime.InferenceSession` and parse `vocab.json` plus `metadata.json`. Validate that `class_count`, the vocab length, and the ONNX output dimension all agree.

### 4.3 ChessModelStrategy rewrite

Rewrite `src/backend/game_engine/chess_model_strategy.py`:

- `_load_model`: build the `InferenceSession` and load vocab plus metadata from the model directory.
- `_predict`: take the current FEN, build a `chess.Board`, encode it, run the session, `argsort` the output descending, and return the first move whose UCI is in `board.legal_moves`. Return `None` if no legal move is present in the vocabulary.
- Keep `engine_move_to_uci` and `uci_to_engine_move` helpers.
- Keep the framework's existing retry-then-random-legal fallback, so a `None` or illegal prediction degrades to a random legal move and is logged.
- Remove the PyTorch and PGN assumptions. The model input is the FEN-derived board tensor, not a PGN string.

### 4.4 Configuration

- `CHESS_AI_STRATEGY=model` gates use; default `minimax` is unchanged.
- Replace `CHESS_MODEL_PATH` (single file) with `CHESS_MODEL_DIR` (the artifact directory). Dev mounts a local artifact dir via the existing commented volume mount; prod bundles the minimal artifact into the image for now (C revisits delivery).

### 4.5 Minimal artifact producer (throwaway, training-side)

- `scripts/train/produce_minimal_chess_artifact.py`. Not shipped in the app image.
- Steps: load a tiny committed sample PGN, build X and y with Brian's exact functions, build a deterministic sorted vocabulary (fixing the reproducibility gap), train a few epochs, save Keras, convert to ONNX with `tf2onnx`, write `vocab.json` and `metadata.json`.
- Depends on TensorFlow and `tf2onnx`, isolated in a separate `requirements-train` file so these never enter the serving image.

### 4.6 Verify script

- `scripts/verify_chess_model.py`: load an artifact dir, take a FEN (default start position), print the predicted UCI. Lets Kevin confirm the pieces work without booting the app.

## 5. Dependencies

- Serving (`requirements.in`): add `onnxruntime`, `numpy`, `chess` (python-chess). Recompile `requirements.txt` with pip-tools per project convention.
- Training/producer (new `requirements-train.in` / `.txt`): `tensorflow`, `tf2onnx`, `tqdm`, `chess`, `numpy`. Never installed into the serving image.

## 6. Data flow per AI move

1. The game router calls the chess AI strategy for the AI's turn.
2. `ChessModelStrategy._predict` reads the current FEN from state.
3. FEN to `chess.Board` to `board_to_matrix` to a `(1, 8, 8, 12)` array.
4. `onnxruntime` runs the session, producing a length-N softmax.
5. `argsort` descending; pick the first UCI in legal moves; decode via vocab.
6. `uci_to_engine_move` converts to the engine move dict; return it.
7. If no legal move is in vocab, the framework retries, then plays a random legal move.

## 7. Failure modes

- Artifact missing or invalid at startup with `CHESS_AI_STRATEGY=model`: fail fast with a clear error naming `CHESS_MODEL_DIR`. (Test env never loads the model.)
- ONNX output dimension not equal to vocab length: loader raises at startup.
- No legal move present in the vocabulary: `_predict` returns `None`; framework random-legal fallback, logged.
- Missing or malformed FEN in state: fall back to replaying move history into a `chess.Board`; if that also fails, framework fallback.

## 8. Reversibility

- A is additive and gated. `CHESS_AI_STRATEGY` defaults to `minimax`, so production behavior is unchanged until the flag is flipped.
- The minimal artifact is a generated stub; deleting it reverts cleanly.
- No destructive operations. Brian's files are untouched. The only irreversible ML hazard (training over weights) is not part of A.

## 9. Testing

The model is bypassed when `ENVIRONMENT=test` (the server uses `DeterministicAIStrategy`), so these target the units directly plus one integration test against a tiny committed fixture artifact.

Test Cases:

| Tier | Scenario | Test name |
|------|----------|-----------|
| Unit | `board_to_matrix` start position has white pawns in channel 0 on rank 2, black pawns in channel 6 on rank 7 | test_board_encoding_start_position |
| Unit | `board_to_matrix` matches Brian's convention for a known mid-game FEN (golden vector) | test_board_encoding_golden_fen |
| Unit | decode plus legal-move mask picks the highest-ranked legal move from a stubbed prediction vector | test_predict_masks_to_legal_move |
| Unit | `_predict` returns None when no legal move is in the vocabulary | test_predict_no_legal_move_in_vocab |
| Unit | `uci_to_engine_move` and `engine_move_to_uci` round-trip, including promotion | test_uci_engine_roundtrip |
| Unit | artifact loader rejects an artifact whose output dim does not equal vocab length | test_artifact_loader_dimension_mismatch |
| Integration | tiny committed fixture artifact loads and returns a legal UCI for the start position via onnxruntime | test_model_strategy_predicts_legal_move |
| Integration | with `CHESS_AI_STRATEGY=model` and a missing artifact dir, startup raises a clear error | test_missing_artifact_startup_error |

A feature is not complete until all listed automated test cases pass in CI.

## 10. Out of scope

B, C, D, the lookahead search, the value network, cloud artifact delivery, reproducible or large-scale data, model strength.

## 11. Open questions

- Source of the minimal artifact's sample PGN: commit a few-KB sample versus download two files at producer runtime. Leaning toward a committed sample for reproducibility and offline tests.
- Where the production artifact comes from before C exists: bundle the minimal artifact in the image now; replace with the artifact registry in C.
