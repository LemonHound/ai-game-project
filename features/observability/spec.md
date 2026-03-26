# Observability Spec (OpenTelemetry)

## Goal

Capture two things:
1. **User interaction patterns** — which endpoints are hit, in what sequence, by whom (user_id / session)
2. **Website performance** — latency, error rates, throughput per route

This is distinct from audit logging (security/compliance) and game data capture (ML training, stats) — those
are separate concerns with separate specs. OTel is not the right tool for either of those.

## Stack

| Concern | Package |
|---------|---------|
| Core SDK | `opentelemetry-sdk` |
| FastAPI auto-instrumentation | `opentelemetry-instrumentation-fastapi` |
| psycopg2 auto-instrumentation | `opentelemetry-instrumentation-psycopg2` |
| GCP trace exporter | `opentelemetry-exporter-gcp-trace` |
| GCP metrics exporter | `opentelemetry-exporter-gcp-monitoring` |
| Propagation | `opentelemetry-propagator-gcp` |

## What Gets Instrumented

### Automatically (no code changes required)
- Every HTTP request/response: method, route, status code, latency — via FastAPI instrumentation
- Every SQL query: statement, duration, error — via psycopg2 instrumentation
- Trace context propagation across service calls

### Manually (thin layer at the API router level only)
Auto-instrumentation captures the request. Manual spans add structured attributes to make traces
filterable and groupable in Cloud Trace. No instrumentation inside game engine files (`game_logic/*.py`).

- **Auth events** (`auth.py`): already implemented — login, register, Google OAuth spans with
  `auth.method`, `auth.user_id` attributes
- **Game endpoints** (`games.py`): add `game.id`, `game.session_id`, `game.difficulty` attributes to the
  auto-instrumented request span — enough to filter by game or session without duplicating spans. AI move
  computation gets a child span (`game.ai.move`) with `game.id` and `compute_duration_ms` — it has real,
  variable duration worth isolating and can fail independently of the request
- **Error events**: caught exceptions in API handlers set `error.type` and `error.message` on the current
  span

### Metrics
Aggregated signals for dashboards and alerting:
- `game.sessions.started` — counter, labelled by game_id
- `game.sessions.completed` — counter, labelled by game_id + outcome (win/loss/draw/abandoned)
- `game.ai.compute_duration` — histogram, labelled by game_id (measures AI move time)
- `auth.logins` — counter, labelled by method (local/google)

## Implementation

### `src/backend/telemetry.py`
Already implemented. Configures TracerProvider + MeterProvider with BatchSpanProcessor and
environment-based exporters (GCP in production, console locally). No changes required.

### `src/backend/app.py`
Already implemented. FastAPIInstrumentor and Psycopg2Instrumentor applied at startup. No changes required.

### `src/backend/auth.py`
Already implemented. Manual spans for login/register/google flows. No changes required.

### `src/backend/games.py`
Add game-specific attributes to the current span at each endpoint — not new spans, just `span.set_attribute`
calls using the active span from auto-instrumentation. Add metric instruments for session counters and AI
compute duration histogram.

## WebSocket

When the WebSocket feature is implemented, the WebSocket spec must include OTel configuration equivalent to
what FastAPI auto-instrumentation provides for HTTP: connection lifecycle events (open, close, error) and
per-message latency, attributed by game_id and session_id. The goal is the same — interaction patterns and
performance — so the same trace context model applies: bundle spans per game+session to build a coherent
story across the connection lifecycle.

## Local Development

When `ENVIRONMENT` is not `production`, all telemetry prints to stdout in a readable format. No GCP
credentials required.

## GCP Prerequisites

- Cloud Trace API enabled
- Cloud Monitoring API enabled
- Service account has `roles/cloudtrace.agent` + `roles/monitoring.metricWriter`

## Test Cases

| Tier | Name | What it checks |
|------|------|----------------|
| Unit | `unit/telemetry.test.py` | `setup_telemetry()` returns valid provider in dev mode without GCP creds |
| API integration | `api/telemetry.spec.ts` | Request to any `/api/*` endpoint produces a trace span with correct attributes (console exporter in test env) |
| API integration | `api/telemetry.spec.ts` | Game endpoint span includes `game.id` and `game.session_id` attributes |
| API integration | `api/telemetry.spec.ts` | Auth endpoint span includes `auth.method` attribute |
| Manual | Cloud Trace dashboard | After first production deploy, verify traces appear and are filterable by game_id |
