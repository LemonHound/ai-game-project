# ADR: Cross-game move storage, event pacing, and optimistic UI

## Status

Accepted (2026-04-11). Implements the review decisions captured alongside PR 152 and follow-up discussion.

## Context

- Data science needs **PGN-shaped** exports; the UI needs **human-readable** move lists; operations need **fast resume**
  and reproducible state.
- Several games used **different hardcoded delays** between server-emitted steps; checkers felt instant in production.
- **Optimistic moves** will ship for some games; the client must not treat a failed validation like a successful commit.

## Decision

1. **Move history and chess exports**  
   The append-only **`move_list`** (per-game standard notation; chess uses **SAN**) remains the canonical move record.
   **PGN documents are regenerated** from `move_list` plus session metadata when a consumer needs a full string. Chess
   **`board_state`** holds a **FEN** string after each applied move for immediate position truth.

2. **Server pacing**  
   A **single** environment variable (e.g. `GAME_SERVER_MIN_EVENT_INTERVAL_MS`) defines the **minimum time between
   consecutive server-emitted game events** for **all** SSE-backed games. Older per-spec millisecond constants are
   superseded by this global floor. The resolved value is **logged** and recorded in **OpenTelemetry** for GCP.

3. **Optimistic UI**  
   **Animate** optimistic placements. On **server rejection**, **skip** success-style animation, **snap** the UI to the
   authoritative `board_state`, and show a **user-visible error**.

## Consequences

- Implementers must centralize emit pacing (not only in checkers) and migrate any conflicting per-game delays.
- Chess persistence and any code that assumed JSON `board_state` must move to **FEN string** storage as specified in
  `spec.md`.
- PGN consumers must call the regeneration path; they must not assume a stored PGN column on the game row.
- Premove and checkers “plan full path then execute” stay **out of scope** for this feature; new specs would supersede
  this ADR for those behaviors.

## Related

- `features/per-game-bugs/spec.md` (behavior and test cases)
- `features/game-data-persistence/spec.md` (historical persistence principles; chess shape may evolve per this ADR)
