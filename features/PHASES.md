# Development Phases & Dependency Order

**Last updated: 2026-03-30** (documentation done 2026-03-30)

This file defines the order in which features should be implemented, based on hard dependencies between
specs. Update it whenever specs are added, completed, or their dependencies change.

## How to read this

- **Phase** = a batch of specs that can be worked in parallel (no internal dependencies within the batch)
- **Blocked by** = the spec cannot begin until all listed specs in prior phases are done
- **Status** = current state; see individual spec files for detail

Specs within a phase have no hard dependencies on each other and can be assigned to separate
implementation conversations simultaneously.

---

## Phase 0 — Foundation (Complete)

These are done or in-progress and unblock everything else.

| Spec | Status | Notes |
|------|--------|-------|
| google-oauth | ready/done | Auth layer; required by all authenticated features |
| react-migration | done | React/Vite frontend in place |
| observability | in-progress | OTel base; update for new persistence model before Phase 2 games |

---

## Phase 1 — Core Persistence + Documentation Foundation

| Spec | Status | Blocked by |
|------|--------|------------|
| game-data-persistence | done | — |
| documentation | done | — |

`game-data-persistence` is complete (PRs #106–108). Three deferred cleanup items remain (SSE param rename, frontend var rename, DB constraint unit tests) — logged in the spec but not blocking Phase 2+.

`documentation` is complete. All Python docstrings and TypeScript JSDoc added. pydocstyle + eslint-plugin-jsdoc enforced in CI. CONTRIBUTING.md, pre-submit hook, and README overhaul done. Dead code removed (models.py, games.py, api/games.ts, docker-compose.yml).

---

## Phase 2 — Infrastructure Updates + About Page (Parallel, after Phase 1)

These can run in parallel with each other.

| Spec | Status | Blocked by |
|------|--------|------------|
| error-handling | done (needs minor update) | game-data-persistence |
| observability | in-progress | game-data-persistence |
| about | needs implementation | — (no dependencies) |

---

## Phase 3 — First Turn-Based Game + Shared UI (Parallel, after Phase 1)

Tic-Tac-Toe is the reference implementation for the SSE + persistence pattern. Player Card is a shared
UI component needed by all game pages.

| Spec | Status | Blocked by |
|------|--------|------------|
| game-tic-tac-toe | in-progress | game-data-persistence |
| player-card | in-progress | google-oauth |

---

## Phase 4 — Remaining Turn-Based Games (Parallel, after Phase 3)

These share the same SSE + persistence architecture as TTT and can all be implemented in parallel once
the reference pattern is validated.

| Spec | Status | Blocked by |
|------|--------|------------|
| game-connect4 | ready | game-tic-tac-toe |
| game-checkers | in-progress | game-tic-tac-toe |
| game-dots-and-boxes | ready | game-tic-tac-toe |

---

## Phase 5 — Chess + Statistics (Parallel, after Phase 4)

Chess is the most complex game and benefits from the patterns established by simpler games. Statistics
requires at least one game implemented to be testable end-to-end.

| Spec | Status | Blocked by |
|------|--------|------------|
| game-chess | ready | game-data-persistence, player-card (for UI) |
| game-statistics | **draft** — needs planning session before implementation | game-data-persistence (at least one game in Phase 3–4 done) |

> `game-statistics` is in draft status. Before implementation begins, schedule a dedicated planning
> conversation to answer the open questions in its spec (streak definition, public vs. private
> profiles, leaderboard scope, completed vs. abandoned game definition).

---

## Phase 6 — Real-Time Game (ON HOLD — low priority)

Pong uses WebSocket (not SSE) and a fundamentally different session model. It does not depend on the
turn-based game pattern. **This phase is explicitly deferred until after the first game ships and the
AI integration is stable.** All other phases take priority.

| Spec | Status | Notes |
|------|--------|-------|
| websocket | finalized | Blocked until pong is prioritized |
| game-pong | finalized | Requires websocket; pong rally training data schema also TBD |

> Do not begin Phase 6 until a deliberate decision is made to resume it. The specs are finalized and
> can be implemented as-is when the time comes.

---

## Phase 7 — Training Data Activation (after Phase 5)

The training data model is defined but inert until real games are producing `move_list` data. Brian
begins AI training work once sufficient chess game records exist.

| Spec | Status | Blocked by |
|------|--------|------------|
| game-training-data | needs implementation | game-data-persistence, game-chess |

---

## Phase 8 — Player Experience (Parallel, after Phase 5)

These require auth + game records + stats to be useful.

| Spec | Status | Blocked by |
|------|--------|------------|
| profile-settings | ready | google-oauth, game-statistics |
| otel-engagement | ready | observability |

---

## Independent — No Hard Dependencies

These can be worked at any time alongside any phase. They do not block or get blocked by game specs.

| Spec | Status | Notes |
|------|--------|-------|
| accessibility | ready | Can run alongside any Phase 3+ game |
| seo | ready | Can run any time after react-migration |
| site-presence | ready | Content/marketing; independent |
| build-optimization | ready | CI/CD performance; can run any time |
| cicd-staging | ready | Staging environment; can run any time |

---

## Discussion Points (Unresolved)

These are open questions flagged during the 2026-03-30 planning session that affect phasing:

1. **`session_id` vs `id` column naming**: The `{game_type}_games` tables use `id` as the PK (the
   session identifier). All game specs and API response shapes have been updated to use `id`. The
   existing frontend code still uses `session_id` throughout and will need migration during each
   game's implementation pass. See the discussion in the 2026-03-30 planning session notes.

2. **Pong + persistence** (deferred with Phase 6): Does pong create a `pong_games` record (for stats,
   with empty `board_state`/`move_list`)? Or use a separate lightweight record? Decide at Phase 6
   planning time.

3. **Pong rally training data** (deferred with Phase 6): The `flush_rally` stub discards data.
   Training model for pong (continuous state, not discrete moves) is undefined. Decide at Phase 6
   planning time.

4. **`game-statistics` open questions**: Streak definition, public vs. private profiles, leaderboard
   scope, completed vs. abandoned definition. Must be resolved in a planning conversation before
   Phase 5 statistics implementation begins.

---

## About This File

### Why a markdown file?

A `PHASES.md` co-located with the specs is the simplest approach that keeps dependency tracking in
the repository — no external tooling, always in sync, readable in any editor or GitHub.

### Is there a more modern alternative?

Yes. The most common industry-standard approaches:

- **GitHub Projects (V2)**: Free with any GitHub repo. Create a "Roadmap" view, add each spec as an
  issue, and set dependency links between issues. Visual, interactive, and linked directly to PRs.
  Recommended if you want a visual board alongside this file.
- **Linear**: A dedicated project management tool popular at startups. More powerful dependency
  tracking but requires an external subscription.
- **Mermaid diagrams**: Add a `flowchart TD` block to this file to generate a visual DAG in GitHub's
  markdown renderer. No extra tooling needed — just markdown syntax.

**Recommendation**: keep this file as the authoritative source (it lives with the code) and optionally
mirror it as GitHub Project issues for visual tracking. The two stay in sync by updating both at
planning time.
