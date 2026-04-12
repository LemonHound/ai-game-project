# ADR: OpenTelemetry Instrumentation Strategy

## Context

The site needed observability infrastructure to capture user interaction patterns and performance
signals. Several decisions were required: which SDK to use, how broadly to instrument, where
manual span boundaries should live, how to export data in different environments, and how to
correlate logs with traces.

## Decisions

### 1. OpenTelemetry SDK — not a custom metrics solution

Use the OpenTelemetry SDK (`opentelemetry-sdk`) with standard auto-instrumentation packages for
FastAPI and SQLAlchemy, exporting to GCP Cloud Trace and Cloud Monitoring in production.

Rationale: OTel is the vendor-neutral standard. It integrates natively with GCP Cloud Trace/Monitoring
and avoids lock-in to a proprietary APM. Custom logging-based metrics would not give distributed
traces or the ability to correlate requests across service boundaries. The alternative (Datadog,
New Relic, etc.) adds cost and vendor coupling that is not warranted at current scale.

### 2. Instrumentation boundary: router and persistence layers only

Manual spans and attributes are added only in `games.py` (router) and `persistence_service.py`
(DB layer). No instrumentation inside `game_engine/` or `game_logic/` files.

Rationale: `game_engine/` files are pure logic — deterministic, no I/O, no latency. Instrumenting
them would add noise without signal. The meaningful latency events are: HTTP request handling
(auto-instrumented), AI move computation (child span in the SSE handler), and DB writes
(child spans in persistence_service). Everything else is sub-millisecond in-process code.

### 3. Span ownership model

- **HTTP spans**: auto-instrumented by `opentelemetry-instrumentation-fastapi`. No manual HTTP spans.
- **AI move span** (`game.ai.move`): child span added to the SSE handler in `games.py`.
  Attributes: `game.id`, `compute_duration_ms`, `ai_invalid_move_count`.
- **DB write spans** (`record_move`, `end_game`): child spans added in `persistence_service.py`.
- **Auth spans**: already implemented in `auth.py`. No changes.

Setting attributes on the auto-instrumented HTTP span (via `span.set_attribute("game.id", ...)`) is
preferred over creating duplicate child spans for request-level context. This keeps the trace tree
flat and readable.

### 4. Environment-based exporter selection

- **`production`**: GCP Cloud Trace exporter + GCP Monitoring exporter.
- **`development` / `test`**: console (stdout) exporter — no GCP credentials required.

The exporter is selected in `setup_telemetry()` based on the `ENVIRONMENT` env var. This keeps local
development friction-free and avoids accidentally sending dev noise to production dashboards.

### 5. Log-trace correlation via LoggingInstrumentor

Call `LoggingInstrumentor().instrument(set_logging_format=True)` in `setup_telemetry()`. In production
(Cloud Run → Cloud Logging), use a JSON formatter that maps `otelTraceID` to
`logging.googleapis.com/trace: projects/{PROJECT_ID}/traces/{trace_id}`. In development, the
plain-text format retains the trace ID as a readable field.

Rationale: without this, log records and Cloud Trace spans are siloed — you cannot click a log line
and jump to its trace. Injecting trace context into every `LogRecord` enables log-to-trace navigation
in Cloud Logging at no additional instrumentation cost.

### 6. Structured log message naming convention

All `logger.*` calls for SSE lifecycle and move rejection events use a `{game}_` prefix on the message
string (e.g. `"c4_sse_error"`, `"chess_invalid_move"`). `extra={"game_id": game_id}` is included on all.

Rationale: consistent message strings make Cloud Logging filters reliable
(`jsonPayload.message="c4_sse_error"`). Without the prefix, filtering across games in Cloud Logging
requires more complex queries or regex.

### 7. WebSocket instrumentation deferred to the WebSocket spec

WebSocket connections do not produce HTTP request spans from auto-instrumentation. Manual
instrumentation is specified in the WebSocket spec: one span per connection (open to close),
with `session_id`, `user_id`, `game=pong`, `close_code`, `duration_ms`, and `points_played` attributes.
Message counters (`game.ws.messages_received`, `game.ws.messages_sent`) are flushed on close rather
than emitted per-message to avoid cardinality explosion.

### 8. OTel is not for audit logging or ML training data

OTel captures interaction patterns and performance signals. It is explicitly not the mechanism for
audit logging (security/compliance) or game move capture (ML training, stats). Those are separate
concerns with separate specs (`game-data-persistence`, `game-statistics`). Conflating them would
create inappropriate coupling between the observability pipeline and the data persistence layer.
