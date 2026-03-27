# Profile & Settings Spec

**Status: ready** (profile stats section depends on game-statistics)

## Background

Both pages exist as route-level stubs in the React frontend (`src/frontend/src/pages/ProfilePage.tsx` and
`src/frontend/src/pages/SettingsPage.tsx`). The backend has a `users` table with display_name, email,
auth_provider, created_at, and last_login. There are no dedicated API endpoints for reading or updating
profile/settings data beyond `/api/auth/me`.

## Scope

Implement the Profile and Settings pages with real content and backend support.

**Profile** — read-only view of the user's account and game history:
- Display name, account info, auth provider (local vs. Google)
- Game statistics summary (depends on game-statistics feature)

**Settings** — editable user preferences and account management:
- Change display name
- Change password (local auth users only)
- Account info (email, auth provider — read-only)
- Account deletion or deactivation (open question)

## Known Requirements

- Both pages require authentication — unauthenticated users should be redirected to home or prompted to log in
- Mobile + desktop responsive
- Profile stats section is dependent on the game-statistics feature; the page should render gracefully if
  stats are unavailable (loading state, empty state)
- Settings changes must be validated on both client and server
- Password changes require current password confirmation before accepting a new one
- Google OAuth users have no password — password change UI must be hidden for them

## Open Questions

- Should the Profile page show a per-game stats breakdown, or only aggregate totals?
- Is there a game history / recent games list on the Profile page?
- Avatar / profile picture support? (Upload, Gravatar, or initials-only?)
- Should Settings include notification preferences? (If we add email notifications later)
- Account deletion: soft delete (deactivate) or hard delete? What happens to game history?
- Should users be able to link/unlink Google OAuth from an existing local account?
- Display name uniqueness: is it enforced, or can two users share a display name?

## Test Cases

_To be defined during planning session._
