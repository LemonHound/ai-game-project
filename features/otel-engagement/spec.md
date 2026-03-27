# OTel User Engagement Analytics Spec

**Status: ready**

## Background

The existing observability feature (`features/observability/`) established OTel infrastructure: FastAPI
auto-instrumentation, psycopg2 instrumentation, GCP Cloud Trace + Cloud Monitoring in production, and basic
manual spans for auth and game events. This spec extends that foundation into a structured user engagement
analytics layer — tracking how users navigate the site, how they interact with games, and surfacing patterns
for product decisions.

## Scope

Instrument meaningful user engagement events across both frontend (React) and backend (FastAPI) using OTel.
Surface these as traces in Cloud Trace and metrics in Cloud Monitoring. This is additive to the existing
observability infrastructure.

## Known Requirements

- Track user navigation patterns: page views, navigation paths, time on page
- Track game engagement: game started, moves made, time per move, game completed vs. abandoned, outcome
- Must build on the existing OTel infrastructure (not a parallel analytics system)
- Frontend and backend instrumentation should produce correlated traces (trace context propagation)
- Must comply with privacy requirements — no PII in span attributes beyond what is necessary and documented
- Backend instrumentation must use `logging` (not `print`) and integrate with GCP Cloud Logging
- When the WebSocket feature is implemented, WebSocket message events must also be instrumented

## Open Questions

### Goals & Use Cases
- What specific questions do we want to answer? (e.g., "which game is most played?", "where do users drop
  off?", "what is average session length by game?")
- Is this for internal product decisions only, or does it need to be shared externally?
- What decisions would be made differently if we had this data?

### Scope of Instrumentation
- What UI interactions beyond page views and game events should be tracked? (Button clicks? Modal opens? Form
  abandonment?)
- Should we track anonymous (unauthenticated) users, or only authenticated users?
- How do we handle users who block telemetry (e.g., ad blockers intercepting requests)?

### Frontend OTel
- Which OTel JS SDK? (`@opentelemetry/sdk-web` + document load auto-instrumentation, or manual spans only?)
- How does the frontend export traces? Direct to GCP, via an OTel collector sidecar, or via a backend proxy
  endpoint?
- How is trace context propagated from frontend spans to backend spans across API calls?

### Metrics vs. Traces
- Should engagement events go into traces, metrics, or both? (Traces = per-event detail; metrics = aggregated)
- What specific Cloud Monitoring dashboards or alerts do we want to build?
- GCP Cloud Trace retention is 30 days by default — is that sufficient, or do we need to export to BigQuery?

### Game-Specific Events
- What game events carry the most signal? (Move quality? Time-to-move? Win/loss by difficulty level?)
- How does this overlap with the game-data-persistence feature — where is the boundary?

### Privacy & Compliance
- What user identifiers (user_id, session_id, anonymous ID) can be included in spans?
- Are there GDPR or regional data residency considerations for trace data stored in GCP?

## Test Cases

_To be defined during planning session._
