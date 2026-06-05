# Chess Data Platform v1 — Plan 2: Serve + fetch (FastAPI service + CLI)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve filtered, size-capped, reproducible game selections from the Postgres corpus over HTTP, and give Kevin and Brian a `chessdata` CLI that fetches a selection and processes it into `data/pgn/`.

**Architecture:** A FastAPI service exposes `GET /games` (filter by dataset/rating/title/size, seeded-deterministic) backed by a parameterized query builder over the Plan 1 `games` table. A Typer CLI calls the service via httpx (`fetch`), then a pure `process` step dedups/validates/chunks the result into `data/pgn/` for Brian's notebook.

**Tech Stack:** FastAPI, uvicorn, Typer, httpx, psycopg2, python-chess, pytest. Builds on Plan 1.

**Spec:** [2026-06-05-chess-data-platform-v1-design.md](../specs/2026-06-05-chess-data-platform-v1-design.md). **Plan 1:** [plan 1 corpus](2026-06-05-chess-data-platform-v1-plan1-corpus.md).

**Repository:** All paths are in the **`chess_CNN` repo**. Plan 1 must be complete (the `chessdata` package, schema, and `insert_games` exist), and the test Postgres from `docker-compose.test.yml` must be running: `docker compose -f docker-compose.test.yml up -d`.

**Naming note:** package is `chessdata`. Run the CLI as `python -m chessdata.cli ...` (no packaging entry point needed for v1).

---

## File map

| Path | Responsibility | Task |
|------|----------------|------|
| `requirements.txt` | add fastapi, uvicorn, typer, httpx | 1 |
| `chessdata/query.py` | filter-to-SQL builder (parameterized) | 2 |
| `chessdata/server/__init__.py`, `chessdata/server/app.py` | FastAPI selection service | 3 |
| `chessdata/process.py` | dedup/validate/chunk staging PGNs into data/pgn | 4 |
| `chessdata/client.py` | httpx client for the service | 5 |
| `chessdata/cli.py` | Typer CLI: fetch / process / datasets | 5 |
| `tests/test_query.py`, `tests/test_server.py`, `tests/test_process.py`, `tests/test_cli.py` | tests | 2-5 |

---

## Task 1: Add service and CLI dependencies

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Append deps to `requirements.txt`**

Add these lines:
```
fastapi
uvicorn
typer
httpx
```

- [ ] **Step 2: Install**

Run: `pip install -r requirements.txt`
Expected: fastapi, uvicorn, typer, httpx install.

- [ ] **Step 3: Commit**

```bash
git add requirements.txt
git commit -m "chore(chessdata): add fastapi, uvicorn, typer, httpx"
```

---

## Task 2: Filter-to-SQL query builder

**Files:**
- Create: `chessdata/query.py`, `tests/test_query.py`

- [ ] **Step 1: Write the failing test**

`tests/test_query.py`:
```python
from chessdata.query import build_games_query


def test_build_query_minimal():
    sql, params = build_games_query("lichess-elite", 100)
    assert "source_dataset = %(dataset)s" in sql
    assert "ORDER BY md5(id::text || %(seed)s)" in sql
    assert "LIMIT %(size)s" in sql
    assert params == {"dataset": "lichess-elite", "size": 100, "seed": "0"}


def test_build_query_all_filters_are_parameterized():
    sql, params = build_games_query(
        "lichess-elite", 50, min_rating=2200, max_rating=2400, title="GM", seed="7"
    )
    assert "white_elo >= %(min_rating)s AND black_elo >= %(min_rating)s" in sql
    assert "white_elo <= %(max_rating)s AND black_elo <= %(max_rating)s" in sql
    assert "white_title = %(title)s AND black_title = %(title)s" in sql
    assert "2200" not in sql and "GM" not in sql
    assert params["min_rating"] == 2200
    assert params["max_rating"] == 2400
    assert params["title"] == "GM"
    assert params["seed"] == "7"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_query.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'chessdata.query'`.

- [ ] **Step 3: Write `chessdata/query.py`**

```python
"""Build a parameterized SQL selection query from game filters."""
from __future__ import annotations

from typing import Optional


def build_games_query(
    dataset: str,
    size: int,
    min_rating: Optional[int] = None,
    max_rating: Optional[int] = None,
    title: Optional[str] = None,
    seed: str = "0",
) -> tuple[str, dict]:
    """Build a parameterized SELECT for games matching the given filters.

    Rating bounds apply to both players; title means both players hold it.
    Selection order is deterministic per seed, so the same arguments return
    the same games for a fixed corpus.

    Args:
        dataset: Dataset name to select from.
        size: Maximum number of games to return.
        min_rating: If set, both players' Elo must be at least this.
        max_rating: If set, both players' Elo must be at most this.
        title: If set, both players must hold this title (e.g. "GM").
        seed: Seed string driving the deterministic selection order.

    Returns:
        A (sql, params) tuple. All values are bound parameters; only fixed
        column SQL is interpolated.
    """
    clauses = ["source_dataset = %(dataset)s"]
    params: dict = {"dataset": dataset, "size": size, "seed": str(seed)}
    if min_rating is not None:
        clauses.append("white_elo >= %(min_rating)s AND black_elo >= %(min_rating)s")
        params["min_rating"] = min_rating
    if max_rating is not None:
        clauses.append("white_elo <= %(max_rating)s AND black_elo <= %(max_rating)s")
        params["max_rating"] = max_rating
    if title is not None:
        clauses.append("white_title = %(title)s AND black_title = %(title)s")
        params["title"] = title
    where = " AND ".join(clauses)
    sql = (
        f"SELECT pgn FROM games WHERE {where} "
        "ORDER BY md5(id::text || %(seed)s) LIMIT %(size)s"
    )
    return sql, params
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_query.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add chessdata/query.py tests/test_query.py
git commit -m "feat(chessdata): parameterized filter-to-SQL query builder"
```

---

## Task 3: FastAPI selection service

**Files:**
- Create: `chessdata/server/__init__.py`, `chessdata/server/app.py`, `tests/test_server.py`

- [ ] **Step 1: Write the failing test**

`tests/test_server.py` (seeds the test DB with 3 games, then drives the app with TestClient; env is pointed at the test DB so the service connects there):
```python
import hashlib

import pytest
from fastapi.testclient import TestClient

from chessdata.db import apply_schema, insert_games


def _row(white_elo, black_elo, title, tag):
    pgn = f'[Event "{tag}"]\n\n1. e4 e5 1-0'
    return {
        "white_elo": white_elo,
        "black_elo": black_elo,
        "white_title": title,
        "black_title": title,
        "time_control": "60+0",
        "result": "1-0",
        "game_date": "2023-06-01",
        "ply_count": 2,
        "pgn": pgn,
        "pgn_hash": hashlib.sha256(pgn.encode("utf-8")).hexdigest(),
    }


@pytest.fixture
def client(conn, monkeypatch):
    monkeypatch.setenv("PGHOST", "localhost")
    monkeypatch.setenv("PGPORT", "5434")
    monkeypatch.setenv("PGDATABASE", "chessdata_test")
    monkeypatch.setenv("PGUSER", "test")
    monkeypatch.setenv("PGPASSWORD", "test")
    apply_schema(conn)
    insert_games(
        conn,
        "lichess-elite",
        [
            _row(2700, 2700, "GM", "g1"),
            _row(2100, 2100, "GM", "g2"),
            _row(2700, 2700, "IM", "g3"),
        ],
    )
    from chessdata.server.app import app

    return TestClient(app)


def test_datasets_lists_counts(client):
    body = client.get("/datasets").json()
    assert {"name": "lichess-elite", "games": 3} in body["datasets"]


def test_games_filters_rating_and_title(client):
    resp = client.get(
        "/games",
        params={"dataset": "lichess-elite", "size": 10,
                "min_rating": 2200, "max_rating": 2800, "title": "GM"},
    )
    assert resp.status_code == 200
    assert resp.text.count("[Event") == 1


def test_games_size_and_seed_determinism(client):
    params = {"dataset": "lichess-elite", "size": 2, "seed": "5"}
    first = client.get("/games", params=params).text
    second = client.get("/games", params=params).text
    assert first == second
    assert first.count("[Event") == 2


def test_games_invalid_params(client):
    resp = client.get(
        "/games",
        params={"dataset": "lichess-elite", "size": 10,
                "min_rating": 2400, "max_rating": 2200},
    )
    assert resp.status_code == 422
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_server.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'chessdata.server'`.

- [ ] **Step 3: Write the service**

`chessdata/server/__init__.py`:
```python
"""FastAPI selection service for the chess data corpus."""
```

`chessdata/server/app.py`:
```python
"""FastAPI app exposing health, dataset listing, and filtered game selection."""
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import PlainTextResponse

from chessdata.config import dsn
from chessdata.db import connect
from chessdata.query import build_games_query

app = FastAPI(title="chessdata")


@app.get("/health")
def health() -> dict:
    """Return a liveness payload.

    Returns:
        A status dict.
    """
    return {"status": "ok"}


@app.get("/datasets")
def datasets() -> dict:
    """List available datasets with their game counts.

    Returns:
        A dict with a 'datasets' list of {name, games}.
    """
    conn = connect(dsn())
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT source_dataset, count(*) FROM games "
                "GROUP BY source_dataset ORDER BY source_dataset"
            )
            rows = cur.fetchall()
    finally:
        conn.close()
    return {"datasets": [{"name": name, "games": count} for name, count in rows]}


@app.get("/games", response_class=PlainTextResponse)
def games(
    dataset: str,
    size: int = Query(..., gt=0),
    min_rating: Optional[int] = None,
    max_rating: Optional[int] = None,
    title: Optional[str] = None,
    seed: str = "0",
) -> str:
    """Return concatenated PGNs for games matching the filters.

    Args:
        dataset: Dataset name to select from.
        size: Maximum number of games to return (must be > 0).
        min_rating: Lower Elo bound applied to both players.
        max_rating: Upper Elo bound applied to both players.
        title: Title both players must hold (e.g. "GM").
        seed: Seed for deterministic selection order.

    Returns:
        Concatenated PGN text, games separated by blank lines.

    Raises:
        HTTPException: 422 if min_rating exceeds max_rating.
    """
    if min_rating is not None and max_rating is not None and min_rating > max_rating:
        raise HTTPException(status_code=422, detail="min_rating must be <= max_rating")
    sql, params = build_games_query(dataset, size, min_rating, max_rating, title, seed)
    conn = connect(dsn())
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            pgns = [row[0] for row in cur.fetchall()]
    finally:
        conn.close()
    return "\n\n".join(pgns)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_server.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add chessdata/server/__init__.py chessdata/server/app.py tests/test_server.py
git commit -m "feat(chessdata): FastAPI filtered selection service"
```

---

## Task 4: Process staging PGNs into data/pgn

**Files:**
- Create: `chessdata/process.py`, `tests/test_process.py`

- [ ] **Step 1: Write the failing test**

`tests/test_process.py`:
```python
import os

from chessdata.parse import iter_games
from chessdata.process import process

_G1 = '[Event "a"]\n\n1. e4 e5 2. Nf3 Nc6 1-0'
_G2 = '[Event "b"]\n\n1. d4 d5 2. c4 e6 0-1'


def test_process_dedup_and_layout(tmp_path):
    in_dir = tmp_path / "in"
    in_dir.mkdir()
    (in_dir / "staging.pgn").write_text(
        "\n\n".join([_G1, _G2, _G1]), encoding="utf-8"
    )
    out_dir = tmp_path / "out"
    written = process(str(in_dir), str(out_dir), games_per_file=1)
    assert written == 2
    files = [f for f in os.listdir(out_dir) if f.endswith(".pgn")]
    assert len(files) == 2
    total = sum(
        len(list(iter_games(os.path.join(out_dir, f)))) for f in files
    )
    assert total == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_process.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'chessdata.process'`.

- [ ] **Step 3: Write `chessdata/process.py`**

```python
"""Process staging PGNs into the data/pgn layout the notebook reads."""
from __future__ import annotations

import hashlib
import os

from chessdata.parse import iter_games


def process(in_dir: str, out_dir: str, games_per_file: int = 5000) -> int:
    """Dedup and validate staging games, writing chunked .pgn files to out_dir.

    Reads every .pgn in in_dir, drops exact-duplicate games, keeps only games
    that parse, and writes them into out_dir as games_per_file-sized .pgn files.

    Args:
        in_dir: Directory of staging .pgn files.
        out_dir: Destination directory (created if missing).
        games_per_file: Number of games per output file.

    Returns:
        The number of unique games written.
    """
    os.makedirs(out_dir, exist_ok=True)
    seen: set[str] = set()
    unique: list[str] = []
    for name in sorted(os.listdir(in_dir)):
        if not name.endswith(".pgn"):
            continue
        for game in iter_games(os.path.join(in_dir, name)):
            text = str(game).strip()
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            if digest in seen:
                continue
            seen.add(digest)
            unique.append(text)

    for chunk_index, start in enumerate(range(0, len(unique), games_per_file)):
        chunk = unique[start:start + games_per_file]
        out_path = os.path.join(out_dir, f"games_{chunk_index:04d}.pgn")
        with open(out_path, "w", encoding="utf-8") as handle:
            handle.write("\n\n".join(chunk) + "\n")
    return len(unique)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_process.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add chessdata/process.py tests/test_process.py
git commit -m "feat(chessdata): process staging PGNs into chunked data/pgn"
```

---

## Task 5: Client and CLI

**Files:**
- Create: `chessdata/client.py`, `chessdata/cli.py`, `tests/test_cli.py`

- [ ] **Step 1: Write the failing test**

`tests/test_cli.py` (drives the real app in-process via httpx ASGITransport — no network — then runs process; this is the fetch-then-process integration test):
```python
import hashlib
import os

import httpx
import pytest

from chessdata.client import fetch_games
from chessdata.db import apply_schema, insert_games
from chessdata.parse import iter_games
from chessdata.process import process


def _row(tag):
    pgn = f'[Event "{tag}"]\n\n1. e4 e5 1-0'
    return {
        "white_elo": 2700, "black_elo": 2700, "white_title": "GM",
        "black_title": "GM", "time_control": "60+0", "result": "1-0",
        "game_date": "2023-06-01", "ply_count": 2, "pgn": pgn,
        "pgn_hash": hashlib.sha256(pgn.encode("utf-8")).hexdigest(),
    }


@pytest.fixture
def seeded_transport(conn, monkeypatch):
    for key, val in {
        "PGHOST": "localhost", "PGPORT": "5434", "PGDATABASE": "chessdata_test",
        "PGUSER": "test", "PGPASSWORD": "test",
    }.items():
        monkeypatch.setenv(key, val)
    apply_schema(conn)
    insert_games(conn, "lichess-elite", [_row("g1"), _row("g2")])
    from chessdata.server.app import app

    return httpx.ASGITransport(app=app)


def test_cli_fetch_then_process(seeded_transport, tmp_path):
    text = fetch_games(
        "http://test", "lichess-elite", 10, transport=seeded_transport
    )
    staging = tmp_path / "staging"
    staging.mkdir()
    (staging / "fetched.pgn").write_text(text, encoding="utf-8")

    out_dir = tmp_path / "data_pgn"
    written = process(str(staging), str(out_dir))
    assert written == 2
    files = [f for f in os.listdir(out_dir) if f.endswith(".pgn")]
    total = sum(len(list(iter_games(os.path.join(out_dir, f)))) for f in files)
    assert total == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_cli.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'chessdata.client'`.

- [ ] **Step 3: Write `chessdata/client.py`**

```python
"""HTTP client for the chessdata selection service."""
from __future__ import annotations

from typing import Optional

import httpx


def fetch_games(
    base_url: str,
    dataset: str,
    size: int,
    min_rating: Optional[int] = None,
    max_rating: Optional[int] = None,
    title: Optional[str] = None,
    seed: str = "0",
    token: Optional[str] = None,
    transport: Optional[httpx.BaseTransport] = None,
) -> str:
    """Fetch matching games as concatenated PGN text from the service.

    Args:
        base_url: Service base URL (e.g. http://homehub:8000).
        dataset: Dataset name.
        size: Maximum number of games.
        min_rating: Lower Elo bound (both players).
        max_rating: Upper Elo bound (both players).
        title: Title both players must hold.
        seed: Deterministic selection seed.
        token: Optional shared token sent as X-Token.
        transport: Optional httpx transport (used by tests to mount the app).

    Returns:
        Concatenated PGN text.
    """
    params: dict = {"dataset": dataset, "size": size, "seed": seed}
    if min_rating is not None:
        params["min_rating"] = min_rating
    if max_rating is not None:
        params["max_rating"] = max_rating
    if title is not None:
        params["title"] = title
    headers = {"X-Token": token} if token else {}
    with httpx.Client(base_url=base_url, transport=transport, timeout=120) as client:
        response = client.get("/games", params=params, headers=headers)
        response.raise_for_status()
        return response.text


def list_datasets(
    base_url: str, transport: Optional[httpx.BaseTransport] = None
) -> list[dict]:
    """List datasets and counts from the service.

    Args:
        base_url: Service base URL.
        transport: Optional httpx transport (tests).

    Returns:
        A list of {name, games} dicts.
    """
    with httpx.Client(base_url=base_url, transport=transport, timeout=30) as client:
        response = client.get("/datasets")
        response.raise_for_status()
        return response.json()["datasets"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_cli.py -v`
Expected: PASS.

- [ ] **Step 5: Write `chessdata/cli.py`**

```python
"""Typer CLI: fetch a selection from the service and process it into data/pgn.

Run as: python -m chessdata.cli <command> [options]
Service URL comes from CHESSDATA_SERVER_URL (default http://localhost:8000);
optional token from CHESSDATA_TOKEN.
"""
from __future__ import annotations

import os
from typing import Optional

import typer

from chessdata.client import fetch_games, list_datasets
from chessdata.process import process as process_games

app = typer.Typer(add_completion=False)


def _server_url() -> str:
    """Return the configured service base URL.

    Returns:
        The CHESSDATA_SERVER_URL value, or the localhost default.
    """
    return os.getenv("CHESSDATA_SERVER_URL", "http://localhost:8000")


@app.command()
def fetch(
    dataset: str,
    size: int,
    out: str,
    min_rating: Optional[int] = None,
    max_rating: Optional[int] = None,
    title: Optional[str] = None,
    seed: str = "0",
) -> None:
    """Fetch a filtered selection and write it to a staging directory."""
    text = fetch_games(
        _server_url(), dataset, size, min_rating, max_rating, title, seed,
        token=os.getenv("CHESSDATA_TOKEN"),
    )
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "fetched.pgn"), "w", encoding="utf-8") as handle:
        handle.write(text)
    typer.echo(f"Wrote selection to {out}")


@app.command()
def process(
    in_dir: str = typer.Option(..., "--in"),
    out: str = "data/pgn",
    games_per_file: int = 5000,
) -> None:
    """Dedup, validate, and chunk staging PGNs into the data/pgn layout."""
    written = process_games(in_dir, out, games_per_file)
    typer.echo(f"Processed {written} games into {out}")


@app.command()
def datasets() -> None:
    """List available datasets and their game counts."""
    for entry in list_datasets(_server_url()):
        typer.echo(f"{entry['name']}: {entry['games']}")


if __name__ == "__main__":
    app()
```

- [ ] **Step 6: Verify the CLI loads**

Run: `python -m chessdata.cli --help`
Expected: shows the `fetch`, `process`, and `datasets` commands.

- [ ] **Step 7: Run the whole suite**

Run: `pytest -v`
Expected: all Plan 1 + Plan 2 tests pass.

- [ ] **Step 8: Commit**

```bash
git add chessdata/client.py chessdata/cli.py tests/test_cli.py
git commit -m "feat(chessdata): httpx client and Typer fetch/process CLI"
```

---

## Self-review

**Spec coverage:**
- FastAPI service /health, /datasets, /games (spec 4.3) → Task 3.
- Filters dataset/size/min_rating/max_rating/title + both-players semantics + 422 (spec 4.3) → Tasks 2, 3.
- Seeded-deterministic selection (spec 4.3) → Task 2 (`ORDER BY md5(id::text || seed)`), verified in Task 3 `test_games_size_and_seed_determinism`.
- CLI fetch/process/datasets, PGN output to data/pgn (spec 4.4) → Tasks 4, 5.
- Config CHESSDATA_SERVER_URL + optional token (spec 4.5) → Task 5 (`_server_url`, `X-Token`).
- psycopg2 parameterized queries (spec 3) → Tasks 2, 3 (`cur.execute(sql, params)`, no value interpolation).
- Test Cases: `test_games_filters_rating_and_title`, `test_games_size_and_seed_determinism`, `test_games_invalid_params` (Task 3); `test_build_query_parameterized` (Task 2, as `test_build_query_all_filters_are_parameterized`); `test_process_dedup_and_layout` (Task 4); `test_cli_fetch_then_process` (Task 5).

**Deferred (not v1):** enforcing the optional token server-side (the client sends `X-Token`; the service does not yet require it — spec leaves auth optional/off by default). Note this gap explicitly; harden in a later pass if you enable a token.

**Placeholder scan:** none.

**Type consistency:** `build_games_query(dataset, size, min_rating, max_rating, title, seed)` is called identically in `app.py` and the tests; `fetch_games(...)` signature matches between `client.py`, `cli.py`, and `test_cli.py`; `process(in_dir, out_dir, games_per_file)` matches across `process.py`, `cli.py`, and tests. The service reads the same `games` columns Plan 1 writes.
