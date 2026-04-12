# ADR: Configurable AI Event Delay via Environment Variable

## Context

Five turn-based games each hardcode their server-side event pacing (e.g. 2.5 s
`StatusBroadcaster` interval, 0.5 s multi-jump step). The `_delay()` helper in `games.py`
already short-circuits to near-zero in `ENVIRONMENT=test`, but this only helps pytest
unit tests — it does not allow integration tests, performance testing, or production
operators to tune the value without a code change.

The checkers spec documented 400 ms for multi-jump pacing; the implementation used 500 ms
because there was no shared source of truth to catch the discrepancy.

## Decision

**Introduce `GAME_SERVER_MIN_EVENT_INTERVAL_MS` as the single authoritative env var for all
server-emitted game event delays.**

- The `_delay()` function reads this var at module load and returns `var_ms / 1000`.
- `StatusBroadcaster.MIN_INTERVAL` and `INITIAL_HOLD` are derived from the same value.
- Production default is `2500` ms (no change from current behaviour).
- The `ENVIRONMENT=test` short-circuit is retained as a safety net for existing unit tests
  that do not set the env var.

## Rejected Alternatives

### Per-game env vars (e.g. `TTT_DELAY_MS`, `CHECKERS_DELAY_MS`)

Rejected. Games already share the same `StatusBroadcaster` and `_delay()` path. Per-game
vars introduce config drift and make cross-game comparisons harder to reason about. A single
global knob is sufficient.

### Keep hardcoded values, accept discrepancies

Rejected. The 400 ms vs 500 ms checkers discrepancy demonstrates the risk: specs and code
diverge silently. A canonical env var makes the production value auditable from config
alone.

### Deduplicate by moving all timing to `base.py` constants

Considered as part of this change. Decided against it: `MIN_INTERVAL` and `INITIAL_HOLD`
are already `StatusBroadcaster` class attributes in `base.py`; deriving them from the env
var at class definition time is sufficient. No additional constant file needed.

## Consequences

- Production behaviour is unchanged (default is `2500` ms).
- CONTRIBUTING.md gains one env var entry.
- All five game specs are updated to remove per-game timing values and instead reference
  this spec.
- Future games inherit the correct delay automatically by using `_delay()` and
  `StatusBroadcaster`.
