# AI Delay Configuration

**Status: ready**

## Background

All five turn-based game implementations contain hardcoded timing values for server-emitted
events — AI "Thinking..." status delays, multi-jump chain pacing, and the `StatusBroadcaster`
minimum interval. These values are currently managed via the `_delay()` helper in `games.py`,
which returns near-zero in `ENVIRONMENT=test` but always uses the hardcoded production value
otherwise.

This means:
- Production timing cannot be tuned without a code change and redeploy.
- Integration tests that exercise timing run at production speed.
- The checkers multi-jump delay was documented as 400ms in its spec but implemented as 500ms
  — a discrepancy that exists because there is no single authoritative source for these values.

Decision: **`adr.md`**.

## Scope

Replace all hardcoded delay values with a single environment variable
`GAME_SERVER_MIN_EVENT_INTERVAL_MS`. All server-emitted game event pacing reads from this
variable at startup, with a sensible production default.

### Files changed

| File | Change |
|------|--------|
| `src/backend/games.py` | `_delay()` reads `GAME_SERVER_MIN_EVENT_INTERVAL_MS` at module load instead of hardcoding seconds |
| `src/backend/game_engine/base.py` | `StatusBroadcaster.MIN_INTERVAL` and `INITIAL_HOLD` derived from the same env var |

### Env var behaviour

| Context | Value | How set |
|---------|-------|---------|
| Production | `2500` (ms) — current default | Cloud Run env / GCP Secret Manager |
| Local dev | `2500` or omitted (uses default) | `.env` or shell export |
| CI / integration tests | `0` or `50` | `docker-compose.test.yml` env block |
| Test cases that assert pacing | explicit value | Set per-test via `monkeypatch` / env override |

The `_delay()` function continues to short-circuit to near-zero when `ENVIRONMENT=test` for
existing pytest unit tests that do not set `GAME_SERVER_MIN_EVENT_INTERVAL_MS` explicitly.
The two mechanisms are independent: `ENVIRONMENT=test` is a safety net; the env var is the
canonical production knob.

### StatusBroadcaster

`MIN_INTERVAL` = `GAME_SERVER_MIN_EVENT_INTERVAL_MS / 1000` seconds (float).
`INITIAL_HOLD` = `MIN_INTERVAL * 0.2` (20 % of interval, capped at 0.5 s).

### Log on startup

At module load or first use, log the resolved interval and its source (env var vs default):

```python
logger.info("ai_delay_config", extra={"interval_ms": resolved_ms, "source": "env" | "default"})
```

## Affected game specs

The following specs previously documented per-game timing values that are superseded by this
spec. Each has been updated to note that pacing is governed by `GAME_SERVER_MIN_EVENT_INTERVAL_MS`:

- `features/game-tic-tac-toe/spec.md`
- `features/game-checkers/spec.md`
- `features/game-connect4/spec.md`
- `features/game-dots-and-boxes/spec.md`
- `features/game-chess/spec.md`

## Known Requirements

- No change to game logic or SSE event shapes.
- The `_delay()` helper is the only call site — no per-game duplication.
- `GAME_SERVER_MIN_EVENT_INTERVAL_MS` must be documented in CONTRIBUTING.md under environment
  variables.
- Observability: on every server-start, the resolved value is logged and recorded as a span
  attribute on the first game event (consistent with the observability spec).

## Test Cases

| Tier | Name | What it checks |
|------|------|----------------|
| Unit | `test_delay_uses_env_var` | `_delay()` returns `env_ms / 1000` when `GAME_SERVER_MIN_EVENT_INTERVAL_MS` is set |
| Unit | `test_delay_uses_default_when_unset` | `_delay()` returns `2.5` when env var absent and `ENVIRONMENT != test` |
| Unit | `test_delay_near_zero_in_test_env` | `_delay()` returns ≤ 0.05 when `ENVIRONMENT=test` regardless of env var |
| Unit | `test_status_broadcaster_min_interval` | `StatusBroadcaster.MIN_INTERVAL` equals `env_ms / 1000` when env var set |
| Integration | `test_game_server_min_event_interval` | With `GAME_SERVER_MIN_EVENT_INTERVAL_MS=2000`, server does not emit a second game event before 2000ms elapsed (checkers or TTT) |
| Manual | Startup log | Confirm `ai_delay_config` log line appears with correct `interval_ms` and `source` values |
