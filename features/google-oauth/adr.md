# ADR: Google OAuth Integration

## Context

The React SPA migration replaced Jinja2-rendered pages with client-side rendering. The existing Google
OAuth callback route was designed to render HTML after token validation, which is incompatible with the
SPA architecture. Decisions were needed about the callback contract, redirect destination, account
linking behavior, and per-environment URI management.

## Decisions

### 1. Backend callback sets cookie and redirects; no HTML rendering

The callback route (`/api/auth/google/callback`) validates the Google ID token, creates or retrieves
the user record, sets the session cookie (httpOnly, samesite=lax, secure in production), then issues
a 302 redirect to `/`. The React frontend picks up auth state via `/api/auth/me` on load.

Rationale: the callback must be a backend route (Google sends the user there) but must return the user
to the SPA. A redirect to `/` is the minimal, stateless bridge. Returning JSON from the callback does
not work — Google opens it in the browser, not via fetch.

### 2. Post-OAuth redirect destination: always `/`

After a successful Google sign-in the user is redirected to the home page regardless of where they
were before initiating sign-in. Deep-link preservation (returning to the original destination) is a
future enhancement — it requires storing the pre-auth URL in a cookie or URL parameter and carries
edge-case complexity not warranted now.

### 3. Account linking: auto-link by email

If a user with a local auth account (email + password) signs in with Google using the same email
address, the Google provider is added to the existing account. The user retains their game history.
No duplicate account is created; no explicit merge step is required from the user.

Alternative considered: require explicit linking via the Settings page. Rejected because it creates
a confusing experience for users who forget they registered with email — they hit an error instead
of being signed in silently.

### 4. Separate redirect URIs per environment

Three redirect URIs are registered in Google Cloud Console:
- Local dev: `http://localhost:8000/api/auth/google/callback`
- Staging: `https://{staging-cloud-run-url}/api/auth/google/callback`
- Production: `https://{WEBSITE_URL}/api/auth/google/callback`

The `GOOGLE_REDIRECT_URI` env var (already in Cloud Build deploy steps) selects the active URI per
environment. No code change is needed to switch environments — only the env var and Cloud Console
registration differ.

### 5. CSRF protection via Google's state parameter

The OAuth flow uses Google's `state` parameter to carry a CSRF token. The backend generates a random
token, stores it in a short-lived cookie before redirecting to Google, and validates it on callback.
This prevents open-redirect and CSRF attacks on the callback endpoint.
