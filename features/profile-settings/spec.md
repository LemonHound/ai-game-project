# Profile & Settings Spec

**Status: implemented**

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
- Stats visibility toggle (public/private — see game-statistics spec)
- Account deletion

## Known Requirements

- Both pages require authentication — unauthenticated users should be redirected to home or prompted to log in
- Mobile + desktop responsive
- Profile stats section is dependent on the game-statistics feature; the page should render gracefully if
  stats are unavailable (loading state, empty state)
- Settings changes must be validated on both client and server
- Password changes require current password confirmation before accepting a new one
- Google OAuth users have no password — password change UI must be hidden for them

## Decisions

### Profile stats: per-game breakdown

The profile page shows a per-game stats grid, not aggregate totals. One row (or card) per game type
showing games played, win rate, and best streak. This matches the data shape from `GET /api/stats/me`
which already returns per-game breakdowns. The game-statistics spec defines this section in detail.

### Game history: not in v1

No game history / recent games list on the Profile page in this feature. Game history is a future
enhancement. The profile page shows stats only.

### Avatar: initials only

No avatar upload, Gravatar, or profile picture support. The profile page uses the same initials
fallback as `PlayerCard` (first letter of display name on a colored circle). Avatar upload is a
future enhancement.

### Account deletion: soft delete

Account deletion deactivates the user (`is_active = false`) rather than hard-deleting the row.
Game history and stats data are retained. The user cannot sign in after deactivation. The email
address is not freed (cannot re-register with the same email after deletion).

A hard-delete option can be added later if required by GDPR right-to-erasure requests, but soft
delete satisfies the common case and is reversible.

### Display name uniqueness: not enforced

Display names do not need to be unique. Two users can share the same display name. Uniqueness
enforcement would require a migration and UX for conflict resolution — not worth the complexity
given that user_id is the primary identity in all game data.

### Notification preferences: deferred

No notification preferences in this feature. There is no email notification system. This section
is added when notifications are introduced.

### Account linking: handled by google-oauth spec

Linking/unlinking Google OAuth from a local account is handled in the google-oauth spec. The Settings
page surfaces the current auth provider (read-only). A "Link Google account" button is a follow-on.

## API Endpoints

### `PATCH /api/auth/settings` (new)

Updates user settings. Lives in `auth.py` for organizational consistency with other user/account
routes. Fields are optional; only provided fields are updated.

**Request:**
```json
{
  "display_name": "NewName",
  "current_password": "oldpass",
  "new_password": "newpass",
  "stats_public": true
}
```

`current_password` and `new_password` must both be provided together or not at all. Google OAuth
users may not submit password fields.

**Response 200:** Updated user object (same shape as `/api/auth/me`).

**Response 400:** Validation error (e.g. missing `current_password` when `new_password` provided).

**Response 401:** `current_password` does not match.

**Response 403:** Google OAuth user attempting a password change.

### `DELETE /api/auth/account` (new)

Soft-deletes the authenticated user's account. Sets `is_active = false`.

**Response 200:** `{"message": "Account deactivated."}`

**Response 401:** Unauthenticated.

## Test Cases

| Tier | Name | What it checks |
|------|------|----------------|
| API integration | `test_settings_update_display_name` | PATCH with display_name updates users row |
| API integration | `test_settings_change_password_success` | PATCH with correct current_password and new_password updates hash |
| API integration | `test_settings_change_password_wrong_current` | PATCH with wrong current_password returns 401 |
| API integration | `test_settings_oauth_user_cannot_change_password` | Google OAuth user PATCH with password fields returns 403 |
| API integration | `test_settings_update_stats_public` | PATCH with stats_public=true updates column; GET /api/stats/user/{id} now returns data |
| API integration | `test_account_deletion_soft_deletes` | DELETE /api/auth/account sets is_active=false; subsequent login returns 401 |
| API integration | `test_account_deletion_retains_game_data` | After deletion, game records for the user still exist in DB |
| E2E | `test_profile_page_shows_display_name` | Navigate to /profile; display name and email rendered |
| E2E | `test_profile_page_shows_per_game_stats` | Per-game stats grid renders with data from /api/stats/me |
| E2E | `test_profile_page_stats_loading_state` | Profile page renders gracefully when stats API is slow or unavailable |
| E2E | `test_settings_display_name_update_flow` | Change display name in settings, save, verify change reflected on profile |
| E2E | `test_settings_password_change_flow` | Enter current and new password, save, verify old password no longer works |
| E2E | `test_settings_oauth_user_no_password_section` | Google OAuth user does not see password change UI |
| E2E | `test_settings_stats_public_toggle` | Toggle stats_public in settings; verify leaderboard visibility changes |
| Manual | Account deletion end-to-end | Delete account; verify cannot log in; verify stats no longer visible on leaderboard |
