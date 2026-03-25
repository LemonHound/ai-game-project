# Error Handling & Resilience Spec

## Background

There is currently no consistent error handling strategy across the frontend or backend. API failures during
gameplay have undefined behavior from the user's perspective. There is no 404 page. React error boundaries are
not implemented. Session expiry during a game is not handled gracefully.

## Scope

Define and implement a consistent error handling layer across both frontend and backend:

**Frontend:**
- 404 / unknown route page
- React error boundaries (catch rendering errors, show fallback UI)
- API error states: failed requests, timeouts, unexpected response shapes
- Mid-game error recovery: what happens when a move API call fails
- Session expiry detection and prompt to re-authenticate

**Backend:**
- Consistent error response shape across all `/api/*` endpoints
- Structured error logging (using `logging`, not `print`) with enough context to diagnose issues
- Distinguish user errors (4xx) from server errors (5xx) clearly

## Known Requirements

- Error responses from the backend must follow a consistent JSON shape (e.g., `{ "detail": "..." }`) — FastAPI
  already does this by default via HTTPException, but all handlers must use it uniformly
- Frontend error states must not leave the user with a blank screen or a spinner that never resolves
- Session expiry must redirect or prompt the user to log in — not silently fail
- All frontend error boundaries must log to OTel (see otel-engagement spec)
- 404 page must be styled consistently with the rest of the site

## Open Questions

- Mid-game API failure: retry automatically, show an error and let the user retry, or abandon the game?
- Should there be a global error toast/notification system, or are errors handled inline per component?
- Network offline detection: should the site detect loss of connectivity and show a banner?
- What is the retry strategy for transient failures (e.g., 503 from Cloud Run cold start)?
- Should error boundary fallbacks offer a "reload" action, or navigate back to a safe page?
- Backend: should unexpected 5xx errors notify anyone (email, Slack, PagerDuty) or just log to GCP?

## Test Cases

_To be defined during planning session._
