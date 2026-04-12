# Google OAuth Spec

**Status: implemented**

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

## Flow (confirmed)

1. User clicks "Sign in with Google" in the React frontend
2. Frontend redirects to Google's OAuth consent screen with the registered client ID and redirect URI
3. Google redirects back to the backend callback route (`/api/auth/google/callback`)
4. Backend validates the Google ID token, creates or retrieves the user, sets the session cookie
5. Backend redirects to the React frontend (`/`) — no HTML rendering, just a redirect
6. React detects the session cookie via `/api/auth/me` on load and updates auth state

## Resolved Questions

- **Callback salvageability**: Audit `auth.py` during implementation. If the callback sets a cookie
  and redirects to `/`, it is salvageable with a path/URL update. If it renders HTML or returns JSON,
  it must be rewritten.
- **Redirect URI pattern for local dev**: The backend callback runs at `localhost:8000`. The redirect
  URI registered in Google Cloud Console for local dev is `http://localhost:8000/api/auth/google/callback`.
  Vite at `localhost:5173` is not the callback target — only the final redirect back to React uses that
  host, and it is a browser redirect (no CORS concern).
- **Post-OAuth redirect destination**: Redirect to `/` unconditionally. The frontend checks auth state
  on load; if the user was mid-navigation before signing in, they restart from the home page.
  Deep-link preservation is a future enhancement.
- **Account linking**: Auto-link by email. If a user registered with local auth and signs in with Google
  using the same email, the accounts are merged automatically — the Google provider ID is added to the
  existing account, and the user retains their game history. No duplicate accounts are created.
- **Client ID / secret rotation**: The Google OAuth client ID and secret live in GCP Secret Manager.
  No rotation concerns specific to this feature — normal Secret Manager versioning handles rotation.

## Audit

Conducted against `src/backend/auth.py` and `src/backend/auth_service.py`.

- **Callback compatibility**: The `GET /api/auth/google/callback` route was already compatible with the
  React SPA flow. It exchanges the authorization code, sets an httpOnly session cookie, and redirects to
  the `state` param (defaulting to `/`). No Jinja2 rendering was present.
- **Account linking**: Was missing. When `find_user_by_email` returned an existing local-auth user,
  neither OAuth handler updated `google_id` or `auth_provider`. Fixed by adding `update_google_link`
  to `AuthService` and calling it from both handlers when the found user's `auth_provider` is not
  already `"google"`.
- **Tests**: Added `tests/api_tests/test_google_oauth.py` covering the three testable error-path cases.
  Positive-path tests require live Google credentials and are covered by the E2E test cases below.

## Known Requirements

- Redirect URI registered in Google Cloud Console must match exactly what the backend sends (including
  protocol and domain) — separate URIs needed for local dev, staging, and production
- Session cookie behavior must be identical to local auth (httpOnly, samesite=lax, secure in production)
- CSRF protection must apply to the OAuth flow
- The flow must work across mobile browsers (some mobile browsers handle OAuth redirects differently)
- Google OAuth users have no password — the Settings page must handle this (see profile-settings spec)

## Test Cases

| Tier | Name | What it checks |
|------|------|----------------|
| API integration | `test_oauth_callback_sets_session_cookie` | Callback route sets httpOnly session cookie on valid Google token |
| API integration | `test_oauth_callback_redirects_to_root` | Callback redirects to `/` after successful auth |
| API integration | `test_oauth_callback_creates_user_if_not_exists` | New Google user gets a users row created |
| API integration | `test_oauth_callback_retrieves_existing_user` | Returning Google user gets the existing users row |
| API integration | `test_oauth_callback_links_existing_local_account` | Google sign-in with email matching a local account merges, does not create duplicate |
| API integration | `test_oauth_callback_rejects_invalid_token` | Invalid Google ID token returns 401 |
| API integration | `test_oauth_callback_rejects_missing_token` | Missing token returns 400 |
| E2E | `test_oauth_sign_in_flow` | Click "Sign in with Google", complete OAuth consent, land on home page authenticated |
| E2E | `test_oauth_sign_in_mobile_browser` | Same flow on a 375px mobile viewport |
| Manual | Redirect URI mismatch | Use a mismatched redirect URI; verify Google returns an error before the callback is reached |
| Manual | Staging OAuth flow | Verify the staging redirect URI is registered and the flow works end-to-end on staging |
