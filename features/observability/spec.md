# Observability Spec (OpenTelemetry)

## Goal
Replace ad hoc `print()` calls with structured, correlated telemetry across
traces, metrics, and logs. In production, data flows to GCP Cloud Trace and
Cloud Monitoring. Locally, a console exporter provides the same signal without
any GCP dependency.

## Stack
| Concern | Package |
|---------|---------|
| Core SDK | `opentelemetry-sdk` |
| FastAPI auto-instrumentation | `opentelemetry-instrumentation-fastapi` |
| psycopg2 auto-instrumentation | `opentelemetry-instrumentation-psycopg2` |
| GCP trace exporter | `opentelemetry-exporter-gcp-trace` |
| GCP metrics exporter | `opentelemetry-exporter-gcp-monitoring` |
| Propagation | `opentelemetry-propagator-gcp` |

## What Gets Instrumented Automatically
- Every HTTP request/response (method, route, status, latency) — FastAPI instrumentation
- Every SQL query (statement, duration, error) — psycopg2 instrumentation
- Trace context propagation across service calls

## What Gets Added Manually
- Auth events: login success/failure, registration, Google OAuth, logout
- Game events: game started, move made, game ended (with outcome)
- Error events: any caught exception in API handlers

## Implementation

### `src/backend/telemetry.py` (new file)
Central setup module. Called once at app startup.

```python
# Configures exporter based on ENVIRONMENT env var:
# - production  → GCP Cloud Trace + Cloud Monitoring
# - development → ConsoleSpanExporter (stdout, human-readable)
# Returns a configured TracerProvider and MeterProvider.
```

### `src/backend/app.py` changes
- Import and call `setup_telemetry()` before app creation
- Add `FastAPIInstrumentor().instrument_app(app)`
- Replace the three `print()` calls with `logging.getLogger(__name__)`

### `src/backend/auth_service.py` changes
- Replace all `print()` with `logger = logging.getLogger(__name__)`
- Add manual spans around login/register flows:
  ```python
  with tracer.start_as_current_span("auth.login") as span:
      span.set_attribute("auth.method", "local")
      span.set_attribute("auth.username", username)
  ```

### `src/backend/database.py` changes
- Add `Psycopg2Instrumentor().instrument()` call in `init_db_pool()`

### `requirements.txt` additions
```
opentelemetry-sdk
opentelemetry-instrumentation-fastapi
opentelemetry-instrumentation-psycopg2
opentelemetry-exporter-gcp-trace
opentelemetry-exporter-gcp-monitoring
opentelemetry-propagator-gcp
```

## Local Development Behaviour
When `ENVIRONMENT` is not `production`, all telemetry prints to stdout in a
readable format. No GCP credentials required. Works inside docker-compose.

## GCP Prerequisites
- Cloud Trace API enabled
- Cloud Monitoring API enabled
- Service account has `roles/cloudtrace.agent` + `roles/monitoring.metricWriter`
  (already included in the deploy checklist in `deploy.yml`)

## Test Cases
| Tier | Name | What it checks |
|------|------|---------------|
| Unit | `unit/telemetry.test.py` | `setup_telemetry()` returns valid provider in dev mode without GCP creds |
| API integration | `api/telemetry.spec.ts` | A request to any `/api/*` endpoint produces a trace span (console exporter in test env) |
| Manual | Cloud Trace dashboard | After first production deploy, verify traces appear for login and game requests |

## Open Questions / Risks
- GCP exporters require ADC (Application Default Credentials) in the container.
  Cloud Run provides these automatically via the attached service account — no
  extra config needed.
- If the React frontend later makes direct calls to third-party services, add
  `opentelemetry-instrumentation-fetch` (JS) for end-to-end trace correlation.
