# Chess Data Platform v1 (Phase D) — Design

Status: Draft for review
Date: 2026-06-05
Owner: Kevin (engineering)
Target repo: Brian's `chess_CNN` (platform code under `platform/`). This spec lives in the hub repo alongside the program overview: [chess-ml-adoption-overview.md](chess-ml-adoption-overview.md).

## 1. Context and scope

Phase D of the Chess ML Adoption program. It gives Kevin and Brian a reproducible way to acquire, filter, and deliver chess training data to identical local `data/pgn/` folders, without sharing data peer-to-peer and without putting data in git.

Brian's notebook consumes `.pgn` files from `data/pgn/` and does all encoding, vocabulary building, and training itself. The platform's job ends at delivering clean PGNs, so his pipeline is unchanged and his input encoding (the 8x8x12 board representation) and output vocabulary stay flexible in Jupyter.

v1 scope: the Lichess Elite dataset, a PostgreSQL store and index on Kevin's home server, a FastAPI selection service, and a CLI with `fetch` and `process`.

Out of scope (designed to slot in later): chess.com ingestion (another ingest path into the same DB), a GCS or other remote storage swap, an optional pre-encoded `process` mode, auth hardening, and scheduled ingestion.

## 2. Goal and non-goals

Goal: `chessdata fetch <filters>` followed by `chessdata process` lands a filtered, size-capped set of cleaned PGNs in `data/pgn/`, reproducibly across machines, served from the home-server hub over Tailscale and testable entirely on localhost.

Non-goals: tensor encoding or move vocabulary (the notebook owns these), model training, chess.com ingestion, cloud storage, and authentication beyond tailnet trust plus an optional shared token.

## 3. Architecture

Three units with clear interfaces:

- PostgreSQL (home server, already running and on by boot): one `games` table holds per-game metadata plus the PGN text, indexed on the filter columns. It is the queryable corpus, hit only at fetch time to select games, never during training. PGN text lives in a TEXT column; Postgres TOAST compresses it transparently.
- FastAPI service (home server; localhost for tests): exposes filtered selection over HTTP, reachable on the tailnet. Connects to Postgres with psycopg2 using parameterized statements.
- CLI client (`chessdata`, Typer): `fetch` calls the service and writes PGNs to a staging folder; `process` normalizes them into `data/pgn/`.

## 4. Components

### 4.1 Schema (`platform/schema.sql`)

A `games` table, applied with `CREATE TABLE IF NOT EXISTS` at ingest:
- `id BIGSERIAL PRIMARY KEY`
- `source_dataset TEXT NOT NULL`
- `white_elo INT`, `black_elo INT`
- `white_title TEXT`, `black_title TEXT`
- `time_control TEXT`
- `result TEXT`
- `game_date DATE`
- `ply_count INT`
- `pgn TEXT NOT NULL`
- `pgn_hash TEXT NOT NULL` (content hash for dedup)
- `UNIQUE (source_dataset, pgn_hash)`

Indexes on `source_dataset`, `white_elo`, `black_elo`, `white_title`, `black_title` (or a composite tuned to the filters).

### 4.2 Ingest (`platform/ingest.py`, Kevin-run on the server)

Reads a small source manifest (`platform/sources/lichess_elite.yaml`) listing the Lichess Elite files for v1 (the most recent 1-2 months). Downloads them, and for each game parses headers with python-chess (Elo, titles, time control, result, date, ply count), then inserts metadata + PGN into Postgres via parameterized psycopg2 statements. Idempotent: the `UNIQUE (source_dataset, pgn_hash)` key plus `ON CONFLICT DO NOTHING` avoids duplicates on re-run.

### 4.3 FastAPI service (`platform/server/`)

Endpoints:
- `GET /health` — liveness.
- `GET /datasets` — available dataset names with game counts.
- `GET /games` — query params: `dataset` (required), `size` (LIMIT, required), `min_rating`, `max_rating`, `title`, `seed` (optional). Builds a parameterized SQL query, selects matching games deterministically for a fixed seed, and streams the concatenated PGN back.

Defaults: `min_rating`/`max_rating` apply to both players (both Elo values within the band); `title` means both players hold it; selection is deterministic given (filters, seed). Invalid params (e.g. `min_rating > max_rating`) return 422 via Pydantic validation.

Config via env: DB connection (host, port, name, user, password) and an optional shared-token header.

### 4.4 CLI (`platform/cli.py`, Typer)

- `chessdata fetch --dataset <name> --size <n> [--min-rating --max-rating --title --seed] --out <dir>` — calls `GET /games`, writes the returned PGNs to `<dir>` (staging). Service URL and optional token come from env/config.
- `chessdata process --in <dir> --out data/pgn` — validates each game parses, dedups, and writes into `data/pgn/` as one or more `.pgn` files (chunked to a configurable games-per-file so the notebook's multi-file read works naturally).
- `chessdata datasets` — prints `GET /datasets`.

### 4.5 Config (`platform/config.py` + env)

Service reads the DB DSN and optional token from the environment. CLI reads `CHESSDATA_SERVER_URL` (localhost for tests, the Tailscale host for real) and an optional token. Nothing secret is committed.

### 4.6 Docs (`platform/README.md`)

One-time: confirm Postgres is up, apply the schema, ingest a slice, run the service (uvicorn bound to the tailnet). Daily: `fetch` then `process`. Local testing: run Postgres and the service on localhost, ingest a tiny fixture, and `fetch`/`process` into a temp folder.

## 5. Data flow

- Setup (Kevin, on the server): `ingest` Lichess into Postgres; run the FastAPI service on the tailnet.
- Use (either machine): `chessdata fetch ...filters... --out ./data/_staging` selects and streams PGNs to staging; `chessdata process --in ./data/_staging --out ./data/pgn` writes clean PGNs; train in the notebook, unchanged.
- Reproducibility: the same (dataset, filters, size, seed) against the same DB snapshot yields the same games on both machines.

## 6. Error handling

- Service unreachable (Tailscale down or service stopped): the CLI prints a clear, actionable error.
- No games match: the service returns 200 with an empty body and a count of 0; the CLI warns.
- Invalid params: 422.
- Partial transfer: `fetch` is re-runnable into a clean staging dir; `process` validates before writing.
- DB errors are surfaced with context, never silently swallowed.

## 7. Testing

Tests use a throwaway local Postgres (Docker or a dedicated test schema) seeded with a handful of fixture games. This mirrors the test-locally-first workflow.

Test Cases:

| Tier | Scenario | Test name |
|------|----------|-----------|
| Unit | parse a PGN's headers into a metadata row (Elo, title, time control, result, ply) | test_parse_game_headers |
| Unit | the filter-to-SQL builder produces a parameterized query for each filter combination | test_build_query_parameterized |
| Unit | process dedups identical games and writes valid chunked .pgn files | test_process_dedup_and_layout |
| Integration | /games returns only games with both players within the rating band and holding the title | test_games_filters_rating_and_title |
| Integration | /games respects the size cap and is deterministic for a fixed seed | test_games_size_and_seed_determinism |
| Integration | CLI fetch against a localhost service writes PGNs; process lands them in data/pgn | test_cli_fetch_then_process |
| Integration | invalid params (min_rating > max_rating) return 422 | test_games_invalid_params |

A feature is not complete until all listed automated test cases pass.

## 8. Open questions

- The exact Lichess Elite files to pin for v1 (which 1-2 months) — set in the source manifest.
- Whether `process` chunks into multiple files (matching the notebook's multi-file read) or one file — default chunked, configurable.
- Optional shared-token auth on the service for v1, or rely on tailnet trust — leaning optional token, default off locally.
