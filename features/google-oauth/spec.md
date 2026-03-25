# Google OAuth Spec

## Background

**What is Jinja2?** It is a Python server-side HTML templating engine. The original version of this site used
FastAPI + Jinja2 to render full HTML pages on the server (like a traditional web app). The React migration
replaced this: FastAPI is now a pure JSON API, and all UI is rendered client-side by React. Jinja2 routes no
longer exist in the app.

**The problem:** Google OAuth requires a registered redirect URI — the URL Google sends the user back to after
they approve sign-in. That URI was previously pointing at a Jinja2-rendered route (e.g.,
`/auth/google/callback`) that processed the OAuth response and rendered an HTML page directly. That page no
longer exists. The callback route may still exist in `src/backend/auth.py` but its response (what it does
after validating the token) is likely incompatible with the React SPA flow.

The current state of OAuth in production is unknown and likely broken or untested post-migration.

## Scope

Audit and fix the full Google OAuth flow end-to-end for the React SPA architecture:
- Confirm what the current backend OAuth callback route does and whether it still works
- Update or replace the callback flow to be compatible with React routing
- Update the registered redirect URI in Google Cloud Console
- Ensure the flow works in both local development and production (Cloud Run)
- Ensure it works in the staging environment once that exists (see cicd-staging spec)

## Proposed Flow (to be confirmed in planning)

1. User clicks "Sign in with Google" in the React frontend
2. Frontend redirects to Google's OAuth consent screen with the registered client ID and redirect URI
3. Google redirects back to the backend callback route (e.g., `/api/auth/google/callback`)
4. Backend validates the Google ID token, creates or retrieves the user, sets the session cookie
5. Backend redirects to the React frontend (e.g., `/`) — no HTML rendering, just a redirect
6. React detects the session cookie via `/api/auth/me` on load and updates auth state

## Known Requirements

- Redirect URI registered in Google Cloud Console must match exactly what the backend sends (including
  protocol and domain) — separate URIs needed for local dev, staging, and production
- Session cookie behavior must be identical to local auth (httpOnly, samesite=lax, secure in production)
- CSRF protection must apply to the OAuth flow
- The flow must work across mobile browsers (some mobile browsers handle OAuth redirects differently)
- Google OAuth users have no password — the Settings page must handle this (see profile-settings spec)

## Open Questions

- Is the current backend callback route in `auth.py` salvageable, or does it need to be rewritten?
- What is the correct redirect URI pattern for local dev (Vite at `localhost:5173` vs. FastAPI at `localhost:8000`)?
- Should the post-OAuth redirect go to `/` or back to wherever the user was before initiating sign-in?
- How should account linking work — if a user registers with email and later signs in with Google using the
  same email, should the accounts merge automatically?
- Are there any Google OAuth client ID / secret rotation concerns (currently stored in GCP Secret Manager)?

## Test Cases

_To be defined during planning session._
