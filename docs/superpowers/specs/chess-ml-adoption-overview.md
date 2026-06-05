# Chess ML Adoption — Program Overview

Status: Living document (update as phases are green-lit)
Last updated: 2026-06-05
Owner: Kevin (engineering)

## Goal

Adopt Brian's chess move-prediction CNN into the product: serve it in real games, keep it improving over time, and offer players versioned difficulty levels.

## Two projects, one seam

The work splits into two independent projects connected by a single handoff:

- AI Game Hub (this repo): serves games and runs inference. Consumes a model artifact only; never touches training data.
- Chess Data and Training Platform (separate): gathers data, trains, and publishes versioned model artifacts. Its data hub runs on Kevin's home Linux server, reached over Tailscale, with a swappable storage backend so it can move to GCS later. Raw data is re-fetchable from public sources (chess.com API, Lichess Elite database), which removes the single-disk durability risk. A CLI tool lets Brian pull named dataset versions into an identical local layout.

The seam between them is the model artifact.

## Repository layout (code only; data and model binaries never go in git)

Two repositories:

- Brian's `chess_CNN` (existing): the entire Chess Data and Training Platform plus experimentation. Holds the notebooks and the engineered platform code (CLI, chess.com ingestion, storage and manifest layout, training runner, artifact producer). Use a light internal split (for example `notebooks/` for experimentation and a packaged `platform/` for the engineered tooling, with its own tests) so exploratory and production code do not tangle. Shared ownership: Brian owns the notebooks, Kevin owns the platform code.
- AI Game Hub (this repo): the website and inference (phase A); consumes model artifacts.

Datasets and trained-model binaries stay in the storage and artifact layers (home server now, GCS-capable later), never in either git repo. Phase B's notebook-to-code porting is mostly intra-repo on the platform side (notebook to platform code in `chess_CNN`), plus porting the inference pieces into the hub repo.

## The model artifact contract (the seam)

An artifact is a versioned directory of three files:

- `model.onnx`: the network, converted from Keras for lightweight serving.
- `vocab.json`: index-to-UCI move map; the decoder the notebook never persisted.
- `metadata.json`: provenance and validation (class count, input shape, source notebook commit, dataset id, created timestamp, content hash).

The platform publishes artifacts; the hub consumes them. Each side can evolve freely as long as this shape holds.

## Key decisions and concepts

- Serve with ONNX/onnxruntime; keep TensorFlow (~1GB) on the training side only.
- The notebook saves weights but not the move vocabulary, and that vocabulary is not reproducible across runs; persisting `vocab.json` with the weights fixes this.
- The model is supervised imitation of human games, not a search engine and not reinforcement learning.
- Difficulty levers (planned product feature): shipped model version, inference-time sampling temperature, and search depth/width.
- Lookahead (scan top X moves, recurse to depth X) is policy-guided search at inference time, hub-side, extending the existing `analyze_position` DFS in `src/backend/ml/chess_analysis.py`. It is distinct from reinforcement learning, which is a training method, platform-side, and a later effort. A learned value network to score leaf positions is the natural follow-on upgrade.
- Reversibility rule for this program: flag any irreversible step and offer an alternative or a Brian-facing note. The main irreversible hazard is training over existing weights, handled by artifact versioning.

## Phases and status

A phase begins only after its own spec is approved and the prior phase's exit criteria are met.

| Phase | Title | Project | Status | Spec |
|-------|-------|---------|--------|------|
| A | Inference integration (serve one artifact, flag-gated) | Hub | Specced, awaiting implementation plan | [phase A](2026-06-05-chess-model-inference-integration-design.md) |
| D | Data storage and retrieval CLI | Platform | Not started | - |
| C | Continued training, versioning, Jupyter-priority sync, RL (future) | Platform | Not started | - |
| B | Notebook-to-code porting (repeatable, updatable) | Shared tooling | Not started | - |
| later | Policy-guided lookahead search | Hub | Not started | - |
| later | Value network for position evaluation | Platform + Hub | Not started | - |

## Out of scope for now

Cloud training GPUs, large-scale data infrastructure, and anything that flips production behavior before a phase is green-lit. Each item lands only through its own spec.
