# Chess Data Platform v1 — Plan 1: Corpus (schema + ingest)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a PostgreSQL `games` corpus and an idempotent ingest that loads Lichess Elite PGNs (metadata + game text) into it, queryable by rating, title, and dataset.

**Architecture:** A `chessdata` Python package in Brian's `chess_CNN` repo. A `games` table (schema applied at ingest) stores per-game metadata plus PGN text. `chessdata.parse` turns python-chess games into rows; `chessdata.ingest` downloads + decompresses the files named in a source manifest and upserts the parsed rows via parameterized psycopg2 statements. Plan 2 (serve + fetch) builds the FastAPI selection service and CLI on top of this schema.

**Tech Stack:** Python 3.11+, PostgreSQL (psycopg2), python-chess, PyYAML, requests, zstandard, pytest. FastAPI/Typer arrive in Plan 2.

**Spec:** [2026-06-05-chess-data-platform-v1-design.md](../specs/2026-06-05-chess-data-platform-v1-design.md). **Program overview:** [chess-ml-adoption-overview.md](../specs/chess-ml-adoption-overview.md).

**Repository:** All paths below are in the **`chess_CNN` repo** (sibling to the hub, e.g. `C:\Website Development\AI Game Website\chess_CNN`), not the hub repo. Run all commands from the `chess_CNN` repo root.

**Naming note:** the package is `chessdata` (NOT `platform`, which would shadow Python's stdlib `platform`).

**Database note:** tests need a local PostgreSQL. This plan adds `docker-compose.test.yml` (Postgres on port 5434 to avoid clashing with the hub's 5433). Bring it up before running DB tests: `docker compose -f docker-compose.test.yml up -d`.

---

## File map

| Path | Responsibility | Task |
|------|----------------|------|
| `requirements.txt` | Platform deps | 1 |
| `docker-compose.test.yml` | Local test Postgres (port 5434) | 1 |
| `pytest.ini` | pytest config (testpaths, env) | 1 |
| `chessdata/__init__.py` | Package marker | 1 |
| `chessdata/config.py` | DB DSN from env | 2 |
| `chessdata/schema.sql` | `games` table DDL | 2 |
| `chessdata/db.py` | connect + apply_schema + insert_games | 2, 4 |
| `chessdata/parse.py` | python-chess game → row dict | 3 |
| `chessdata/download.py` | download + decompress source files | 5 |
| `chessdata/sources/lichess_elite.yaml` | source manifest | 5 |
| `chessdata/ingest.py` | orchestrate download→parse→insert + `__main__` | 6 |
| `tests/conftest.py` | DB fixture | 2 |
| `tests/fixtures/sample.pgn` | tiny PGN for tests | 3 |
| `tests/test_db.py`, `tests/test_parse.py`, `tests/test_download.py`, `tests/test_ingest.py` | tests | 2-6 |

---

## Task 1: Scaffold the `chessdata` package and test Postgres

**Files:**
- Create: `chessdata/__init__.py`, `requirements.txt`, `docker-compose.test.yml`, `pytest.ini`

- [ ] **Step 1: Create the package marker**

`chessdata/__init__.py`:
```python
"""Chess data platform: ingest, store, and serve chess training data."""
```

- [ ] **Step 2: Create `requirements.txt`**

```
psycopg2-binary
chess
PyYAML
requests
zstandard
pytest
```

- [ ] **Step 3: Create `docker-compose.test.yml`**

```yaml
services:
  test-db:
    image: postgres:17
    environment:
      POSTGRES_DB: chessdata_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - "5434:5432"
```

- [ ] **Step 4: Create `pytest.ini`**

```ini
[pytest]
testpaths = tests
```

- [ ] **Step 5: Install deps and start the test DB**

Run:
```bash
pip install -r requirements.txt
docker compose -f docker-compose.test.yml up -d
```
Expected: deps install; the `test-db` container is running.

- [ ] **Step 6: Commit**

```bash
git add chessdata/__init__.py requirements.txt docker-compose.test.yml pytest.ini
git commit -m "chore(chessdata): scaffold package, deps, and test Postgres"
```

---

## Task 2: Config, schema, and DB connection

**Files:**
- Create: `chessdata/config.py`, `chessdata/schema.sql`, `chessdata/db.py`, `tests/conftest.py`, `tests/test_db.py`

- [ ] **Step 1: Write the failing test**

`tests/conftest.py`:
```python
import psycopg2
import pytest

from chessdata.config import test_dsn


@pytest.fixture
def conn():
    connection = psycopg2.connect(test_dsn())
    connection.autocommit = True
    with connection.cursor() as cur:
        cur.execute("DROP TABLE IF EXISTS games")
    yield connection
    connection.close()
```

`tests/test_db.py`:
```python
from chessdata.db import apply_schema


def test_apply_schema_creates_games_table(conn):
    apply_schema(conn)
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('games')")
        assert cur.fetchone()[0] == "games"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_db.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'chessdata.config'`.

- [ ] **Step 3: Write `chessdata/config.py`**

```python
"""Database connection configuration from environment variables."""
from __future__ import annotations

import os


def dsn() -> str:
    """Return the libpq DSN for the configured database.

    Reads PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD with sensible defaults.

    Returns:
        A psycopg2-compatible connection string.
    """
    host = os.getenv("PGHOST", "localhost")
    port = os.getenv("PGPORT", "5432")
    name = os.getenv("PGDATABASE", "chessdata")
    user = os.getenv("PGUSER", "chessdata")
    password = os.getenv("PGPASSWORD", "chessdata")
    return f"host={host} port={port} dbname={name} user={user} password={password}"


def test_dsn() -> str:
    """Return the DSN for the local test database (docker-compose.test.yml).

    Returns:
        A psycopg2-compatible connection string for the test Postgres on port 5434.
    """
    return os.getenv(
        "CHESSDATA_TEST_DSN",
        "host=localhost port=5434 dbname=chessdata_test user=test password=test",
    )
```

- [ ] **Step 4: Write `chessdata/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS games (
    id BIGSERIAL PRIMARY KEY,
    source_dataset TEXT NOT NULL,
    white_elo INT,
    black_elo INT,
    white_title TEXT,
    black_title TEXT,
    time_control TEXT,
    result TEXT,
    game_date DATE,
    ply_count INT,
    pgn TEXT NOT NULL,
    pgn_hash TEXT NOT NULL,
    UNIQUE (source_dataset, pgn_hash)
);
CREATE INDEX IF NOT EXISTS games_dataset_idx ON games (source_dataset);
CREATE INDEX IF NOT EXISTS games_white_elo_idx ON games (white_elo);
CREATE INDEX IF NOT EXISTS games_black_elo_idx ON games (black_elo);
CREATE INDEX IF NOT EXISTS games_white_title_idx ON games (white_title);
CREATE INDEX IF NOT EXISTS games_black_title_idx ON games (black_title);
```

- [ ] **Step 5: Write `chessdata/db.py`**

```python
"""PostgreSQL connection and schema management for the chess data corpus."""
from __future__ import annotations

import os

import psycopg2

_SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")


def connect(dsn: str) -> "psycopg2.extensions.connection":
    """Open a PostgreSQL connection.

    Args:
        dsn: libpq connection string.

    Returns:
        An open psycopg2 connection.
    """
    return psycopg2.connect(dsn)


def apply_schema(conn: "psycopg2.extensions.connection") -> None:
    """Create the games table and indexes if they do not exist.

    Args:
        conn: An open psycopg2 connection.
    """
    with open(_SCHEMA_PATH, "r", encoding="utf-8") as handle:
        sql = handle.read()
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pytest tests/test_db.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add chessdata/config.py chessdata/schema.sql chessdata/db.py tests/conftest.py tests/test_db.py
git commit -m "feat(chessdata): add config, games schema, and connection helpers"
```

---

## Task 3: Parse python-chess games into rows

**Files:**
- Create: `chessdata/parse.py`, `tests/fixtures/sample.pgn`, `tests/test_parse.py`

- [ ] **Step 1: Create the fixture**

`tests/fixtures/sample.pgn`:
```
[Event "Rated Bullet game"]
[Site "https://lichess.org/abcd1234"]
[White "AlphaPlayer"]
[Black "BetaPlayer"]
[Result "1-0"]
[UTCDate "2023.06.01"]
[WhiteElo "2710"]
[BlackElo "2695"]
[WhiteTitle "GM"]
[BlackTitle "GM"]
[TimeControl "60+0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O 1-0
```

- [ ] **Step 2: Write the failing test**

`tests/test_parse.py`:
```python
import os

from chessdata.parse import iter_games, parse_game

_FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "sample.pgn")


def test_parse_game_headers():
    games = list(iter_games(_FIXTURE))
    assert len(games) == 1
    row = parse_game(games[0])
    assert row["white_elo"] == 2710
    assert row["black_elo"] == 2695
    assert row["white_title"] == "GM"
    assert row["black_title"] == "GM"
    assert row["time_control"] == "60+0"
    assert row["result"] == "1-0"
    assert row["game_date"] == "2023-06-01"
    assert row["ply_count"] == 9
    assert row["pgn"].strip().endswith("1-0")
    assert len(row["pgn_hash"]) == 64
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/test_parse.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'chessdata.parse'`.

- [ ] **Step 4: Write `chessdata/parse.py`**

```python
"""Parse PGN games into corpus row dicts using python-chess."""
from __future__ import annotations

import hashlib
from typing import Iterator, Optional

import chess.pgn


def iter_games(pgn_path: str) -> Iterator[chess.pgn.Game]:
    """Yield each game in a PGN file.

    Args:
        pgn_path: Path to a .pgn file.

    Yields:
        python-chess Game objects, one per game in the file.
    """
    with open(pgn_path, "r", encoding="utf-8", errors="replace") as handle:
        while True:
            game = chess.pgn.read_game(handle)
            if game is None:
                return
            yield game


def _int_or_none(value: Optional[str]) -> Optional[int]:
    """Return value as int, or None if missing or non-numeric.

    Args:
        value: A header string or None.

    Returns:
        The integer value, or None.
    """
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _date_or_none(value: Optional[str]) -> Optional[str]:
    """Convert a PGN UTCDate (YYYY.MM.DD) to ISO (YYYY-MM-DD), or None.

    Args:
        value: A PGN date header or None.

    Returns:
        ISO date string, or None if unparseable.
    """
    if not value or "?" in value:
        return None
    return value.replace(".", "-")


def parse_game(game: chess.pgn.Game) -> dict:
    """Extract metadata and PGN text from a python-chess game.

    Args:
        game: A python-chess Game.

    Returns:
        A dict with keys: white_elo, black_elo, white_title, black_title,
        time_control, result, game_date, ply_count, pgn, pgn_hash.
    """
    headers = game.headers
    pgn_text = str(game).strip()
    ply_count = sum(1 for _ in game.mainline_moves())
    return {
        "white_elo": _int_or_none(headers.get("WhiteElo")),
        "black_elo": _int_or_none(headers.get("BlackElo")),
        "white_title": headers.get("WhiteTitle") or None,
        "black_title": headers.get("BlackTitle") or None,
        "time_control": headers.get("TimeControl") or None,
        "result": headers.get("Result") or None,
        "game_date": _date_or_none(headers.get("UTCDate") or headers.get("Date")),
        "ply_count": ply_count,
        "pgn": pgn_text,
        "pgn_hash": hashlib.sha256(pgn_text.encode("utf-8")).hexdigest(),
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/test_parse.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add chessdata/parse.py tests/fixtures/sample.pgn tests/test_parse.py
git commit -m "feat(chessdata): parse PGN games into corpus rows"
```

---

## Task 4: Idempotent insert into Postgres

**Files:**
- Modify: `chessdata/db.py` (add `insert_games`)
- Create: tests in `tests/test_db.py` (append)

- [ ] **Step 1: Append the failing test**

Append to `tests/test_db.py`:
```python
import os

from chessdata.db import insert_games
from chessdata.parse import iter_games, parse_game

_FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "sample.pgn")


def _fixture_rows():
    return [parse_game(g) for g in iter_games(_FIXTURE)]


def test_insert_games_inserts_rows(conn):
    apply_schema(conn)
    inserted = insert_games(conn, "lichess-elite", _fixture_rows())
    assert inserted == 1
    with conn.cursor() as cur:
        cur.execute("SELECT source_dataset, white_elo, white_title FROM games")
        assert cur.fetchone() == ("lichess-elite", 2710, "GM")


def test_insert_games_is_idempotent(conn):
    apply_schema(conn)
    insert_games(conn, "lichess-elite", _fixture_rows())
    inserted_again = insert_games(conn, "lichess-elite", _fixture_rows())
    assert inserted_again == 0
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM games")
        assert cur.fetchone()[0] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_db.py -v`
Expected: FAIL with `ImportError: cannot import name 'insert_games'`.

- [ ] **Step 3: Add `insert_games` to `chessdata/db.py`**

Append to `chessdata/db.py`:
```python
def insert_games(
    conn: "psycopg2.extensions.connection", source_dataset: str, rows: list[dict]
) -> int:
    """Insert parsed game rows, skipping duplicates by (source_dataset, pgn_hash).

    Args:
        conn: An open psycopg2 connection.
        source_dataset: Dataset name to tag these games with.
        rows: Parsed row dicts from chessdata.parse.parse_game.

    Returns:
        The number of rows actually inserted (excludes skipped duplicates).
    """
    inserted = 0
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                INSERT INTO games (
                    source_dataset, white_elo, black_elo, white_title, black_title,
                    time_control, result, game_date, ply_count, pgn, pgn_hash
                ) VALUES (
                    %(source_dataset)s, %(white_elo)s, %(black_elo)s, %(white_title)s,
                    %(black_title)s, %(time_control)s, %(result)s, %(game_date)s,
                    %(ply_count)s, %(pgn)s, %(pgn_hash)s
                )
                ON CONFLICT (source_dataset, pgn_hash) DO NOTHING
                """,
                {**row, "source_dataset": source_dataset},
            )
            inserted += cur.rowcount
    conn.commit()
    return inserted
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_db.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add chessdata/db.py tests/test_db.py
git commit -m "feat(chessdata): idempotent game insert with ON CONFLICT"
```

---

## Task 5: Source manifest, download, and decompress

**Files:**
- Create: `chessdata/sources/lichess_elite.yaml`, `chessdata/download.py`, `tests/test_download.py`

- [ ] **Step 1: Create the manifest**

`chessdata/sources/lichess_elite.yaml`:
```yaml
dataset: lichess-elite
files:
  - url: "https://database.nikonoel.fr/lichess_elite_2023-06.zst"
    compression: zst
```
(Confirm the exact filename/month against https://database.nikonoel.fr/ before a real ingest; the value here is the v1 pin and can be edited.)

- [ ] **Step 2: Write the failing test**

`tests/test_download.py`:
```python
import zstandard

from chessdata.download import decompress, load_manifest


def test_load_manifest(tmp_path):
    path = tmp_path / "m.yaml"
    path.write_text(
        "dataset: lichess-elite\nfiles:\n  - url: http://x/y.zst\n    compression: zst\n",
        encoding="utf-8",
    )
    manifest = load_manifest(str(path))
    assert manifest["dataset"] == "lichess-elite"
    assert manifest["files"][0]["compression"] == "zst"


def test_decompress_zst(tmp_path):
    raw = b"[Event \"x\"]\n\n1. e4 e5 1-0\n"
    src = tmp_path / "g.pgn.zst"
    src.write_bytes(zstandard.ZstdCompressor().compress(raw))
    dst = tmp_path / "g.pgn"
    decompress(str(src), str(dst), "zst")
    assert dst.read_bytes() == raw
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/test_download.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'chessdata.download'`.

- [ ] **Step 4: Write `chessdata/download.py`**

```python
"""Download and decompress source dataset files named in a manifest."""
from __future__ import annotations

import shutil

import requests
import yaml
import zstandard


def load_manifest(path: str) -> dict:
    """Load a source manifest YAML file.

    Args:
        path: Path to the manifest.

    Returns:
        The parsed manifest dict with keys 'dataset' and 'files'.
    """
    with open(path, "r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def download_file(url: str, dest: str) -> None:
    """Stream-download a URL to a local path.

    Args:
        url: Source URL.
        dest: Local destination path.
    """
    with requests.get(url, stream=True, timeout=60) as response:
        response.raise_for_status()
        with open(dest, "wb") as handle:
            for chunk in response.iter_content(chunk_size=1 << 20):
                handle.write(chunk)


def decompress(src: str, dst: str, compression: str) -> None:
    """Decompress a source file to a plain .pgn path.

    Args:
        src: Compressed source path.
        dst: Destination path for the decompressed bytes.
        compression: One of 'zst' or 'none'.

    Raises:
        ValueError: If the compression type is unsupported.
    """
    if compression == "none":
        shutil.copyfile(src, dst)
        return
    if compression == "zst":
        with open(src, "rb") as fin, open(dst, "wb") as fout:
            zstandard.ZstdDecompressor().copy_stream(fin, fout)
        return
    raise ValueError(f"Unsupported compression: {compression!r}")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/test_download.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add chessdata/sources/lichess_elite.yaml chessdata/download.py tests/test_download.py
git commit -m "feat(chessdata): source manifest, download, and zst decompress"
```

---

## Task 6: Ingest orchestration and CLI entry

**Files:**
- Create: `chessdata/ingest.py`, `tests/test_ingest.py`

- [ ] **Step 1: Write the failing test**

`tests/test_ingest.py` (uses a local manifest with `compression: none` pointing at the fixture, so no network):
```python
import os

from chessdata.db import apply_schema
from chessdata.ingest import ingest

_FIXTURE_PGN = os.path.join(os.path.dirname(__file__), "fixtures", "sample.pgn")


def test_ingest_local_manifest(conn, tmp_path):
    apply_schema(conn)
    manifest = tmp_path / "local.yaml"
    manifest.write_text(
        f"dataset: lichess-elite\nfiles:\n  - url: {_FIXTURE_PGN}\n    compression: none\n",
        encoding="utf-8",
    )
    work = tmp_path / "work"
    work.mkdir()
    inserted = ingest(str(manifest), conn, work_dir=str(work))
    assert inserted == 1
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM games WHERE source_dataset = 'lichess-elite'")
        assert cur.fetchone()[0] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_ingest.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'chessdata.ingest'`.

- [ ] **Step 3: Write `chessdata/ingest.py`**

`local_path` handling: when a manifest `url` is an existing local file, use it directly (so tests and pre-downloaded files work without network).

```python
"""Orchestrate corpus ingest: download, decompress, parse, and insert."""
from __future__ import annotations

import argparse
import os

from chessdata.config import dsn
from chessdata.db import apply_schema, connect, insert_games
from chessdata.download import decompress, download_file, load_manifest
from chessdata.parse import iter_games, parse_game


def _materialize(file_entry: dict, work_dir: str, index: int) -> str:
    """Produce a local .pgn path for a manifest file entry.

    Downloads the URL unless it is already a local path, then decompresses.

    Args:
        file_entry: A manifest 'files' entry with 'url' and 'compression'.
        work_dir: Directory for intermediate and output files.
        index: Position in the file list, used to name outputs.

    Returns:
        Path to the decompressed .pgn file.
    """
    url = file_entry["url"]
    compression = file_entry.get("compression", "none")
    if os.path.isfile(url):
        src = url
    else:
        src = os.path.join(work_dir, f"src_{index}")
        download_file(url, src)
    out = os.path.join(work_dir, f"games_{index}.pgn")
    decompress(src, out, compression)
    return out


def ingest(manifest_path: str, conn, work_dir: str) -> int:
    """Ingest every file in a manifest into the games corpus.

    Args:
        manifest_path: Path to a source manifest YAML.
        conn: An open psycopg2 connection (schema already applied).
        work_dir: Directory for downloaded/decompressed files.

    Returns:
        Total number of new games inserted.
    """
    manifest = load_manifest(manifest_path)
    dataset = manifest["dataset"]
    total = 0
    for index, file_entry in enumerate(manifest["files"]):
        pgn_path = _materialize(file_entry, work_dir, index)
        rows = [parse_game(game) for game in iter_games(pgn_path)]
        total += insert_games(conn, dataset, rows)
    return total


def main() -> None:
    """CLI entry: ingest a manifest into the configured database."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--manifest",
        default=os.path.join(os.path.dirname(__file__), "sources", "lichess_elite.yaml"),
    )
    parser.add_argument("--work-dir", default="./_ingest_work")
    args = parser.parse_args()

    os.makedirs(args.work_dir, exist_ok=True)
    conn = connect(dsn())
    apply_schema(conn)
    inserted = ingest(args.manifest, conn, args.work_dir)
    conn.close()
    print(f"Ingested {inserted} new games")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_ingest.py -v`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `pytest -v`
Expected: all tests pass (db, parse, download, ingest).

- [ ] **Step 6: Commit**

```bash
git add chessdata/ingest.py tests/test_ingest.py
git commit -m "feat(chessdata): ingest orchestration and CLI entry"
```

---

## Self-review

**Spec coverage:**
- Schema (spec 4.1) → Task 2 (`schema.sql`, applied by `apply_schema`).
- Ingest + parse + dedup (spec 4.2) → Tasks 3 (parse), 4 (idempotent insert), 5 (download/decompress), 6 (orchestration + CLI).
- Source manifest (spec 4.2) → Task 5.
- PostgreSQL + psycopg2 parameterized (spec 3, 4.2) → Tasks 2, 4 (named-parameter `cur.execute`).
- Config via env (spec 4.5) → Task 2 (`config.py`).
- Test-locally-first + throwaway Postgres (spec 7) → Task 1 (`docker-compose.test.yml`), `conftest.py` DB fixture.
- Test Cases: `test_parse_game_headers` (Task 3), `test_insert_games_*` / idempotency (Task 4); the service/CLI test cases (`test_games_*`, `test_cli_fetch_then_process`) belong to **Plan 2**.

**Out of scope here (Plan 2):** the FastAPI selection service, the filter-to-SQL query builder, and the `chessdata` Typer CLI (`fetch`/`process`). Those build on this schema.

**Placeholder scan:** none. The manifest's pinned filename is a real default flagged for confirmation against the source, not a TBD.

**Type consistency:** `parse_game` returns the exact keys `insert_games` reads; `insert_games(conn, source_dataset, rows)` and `ingest(manifest_path, conn, work_dir)` signatures are used identically in tests and `main`. `load_manifest`/`download_file`/`decompress` signatures match across `download.py` and `ingest.py`.
