# Accessibility (a11y) Spec

**Status: ready**

## Priority: Low

This feature is low priority and may not be addressed for some time. It is documented here to avoid
the work being forgotten as the site matures.

## Background

No accessibility audit has been performed. The site uses Tailwind CSS + DaisyUI which provides some a11y
defaults (semantic HTML, ARIA roles on interactive components) but does not guarantee full compliance.
Game boards — particularly canvas-based games (Pong) and grid-based games (Chess, Checkers) — present
specific challenges for keyboard navigation and screen readers.

## Scope

Bring the site to a reasonable a11y baseline. Full WCAG 2.1 AA compliance is aspirational; the immediate
goal is to eliminate the most impactful barriers:
- Keyboard navigation throughout the site and through game UI
- Screen reader support for non-canvas game boards (TTT, Connect4, Dots & Boxes, Checkers, Chess)
- Sufficient color contrast for all text and interactive elements
- Focus management in modals and dropdowns (AuthModal, navbar dropdown)
- Meaningful alt text and ARIA labels where visual-only cues exist

## Known Requirements

- Canvas-based games (Pong) have inherent a11y limitations; the goal is to ensure non-game UI around them
  is accessible and that an appropriate `aria-label` or description is present on the canvas element
- Focus must be trapped within modals while open and restored to the trigger element on close
- All interactive elements must be reachable and operable via keyboard
- DaisyUI theme colors must pass WCAG AA contrast ratio (4.5:1 for normal text, 3:1 for large text)
- Screen reader announcements for game state changes (whose turn, move result, game outcome)

## Decisions

### WCAG target: AA

WCAG 2.1 AA is the target. Level A is the floor — missing Level A criteria are bugs. Level AAA is out
of scope for this feature pass; specific AAA criteria can be addressed individually if needed.

### Screen readers: NVDA + VoiceOver (primary)

Primary test targets: NVDA on Windows, VoiceOver on macOS and iOS. These cover the two most common
screen reader + OS combinations for web. TalkBack on Android is a secondary target — test
manually if resources allow, but not a blocking gate.

### Game board alternative interface: ARIA live regions only

For non-canvas game boards, use ARIA live regions (`aria-live="polite"`) to announce state changes
(move results, whose turn, game outcome). No separate text-based alternative interface is provided.

Rationale: a full text-based game interface would be a significant parallel implementation.
ARIA live regions are the standard web approach and are sufficient for users who want to play with
a screen reader. If user demand for a richer accessible interface emerges, it can be specced
separately.

### Reduced motion: support `prefers-reduced-motion`

Any CSS animations or transitions (win animations, drop animations, transitions) must respect
`prefers-reduced-motion: reduce`. This means instant or near-instant state changes when the user
has the OS reduced-motion preference set.

### Audit tooling: automated + manual

Automated: axe DevTools (browser extension) + Lighthouse a11y audit. These catch ~30–40% of issues.
Manual: keyboard-only navigation walkthrough + NVDA (Windows) + VoiceOver (macOS). The manual pass
is required before the feature is considered complete.

### Legal/compliance

No specific legal/compliance requirements (ADA, EN 301 549, etc.) have been identified. WCAG AA is
adopted as a quality standard, not a compliance obligation. This may change if the site expands to
institutional users or markets with regulatory requirements.

## Test Cases

### Automated (axe + Lighthouse)

| Tier | Name | What it checks |
|------|------|----------------|
| E2E | `test_a11y_home_page_no_violations` | axe scan of `/` returns zero violations at AA level |
| E2E | `test_a11y_games_page_no_violations` | axe scan of `/games` returns zero violations |
| E2E | `test_a11y_about_page_no_violations` | axe scan of `/about` returns zero violations |
| E2E | `test_a11y_auth_modal_no_violations` | axe scan of AuthModal (open state) returns zero violations |
| E2E | `test_a11y_game_page_no_violations` | axe scan of a game page (e.g. `/game/tic-tac-toe`) in newgame phase |

### Keyboard navigation

| Tier | Name | What it checks |
|------|------|----------------|
| E2E | `test_a11y_nav_keyboard_reachable` | All navbar links reachable via Tab; Enter activates them |
| E2E | `test_a11y_auth_modal_focus_trap` | Tab cycles within AuthModal while open; focus returns to trigger on close |
| E2E | `test_a11y_game_board_keyboard_operable` | All interactive board cells/columns reachable via keyboard (TTT, Connect4) |

### Contrast

| Tier | Name | What it checks |
|------|------|----------------|
| Manual | DaisyUI theme contrast | All text + interactive elements pass 4.5:1 (normal) / 3:1 (large) ratio in both light and dark themes |

### Screen reader (manual)

| Scenario |
|---|
| NVDA + Chrome: navigate home page, games list, and about page via screen reader only |
| NVDA + Chrome: start a TTT game; verify whose-turn and move-result announcements via live regions |
| VoiceOver + Safari: same navigation and game flow as above |
| NVDA + Chrome: open and close AuthModal using keyboard; verify focus trap and restoration |
| VoiceOver + iOS Safari: verify all nav links and game pages are reachable on mobile |
| Canvas (Pong): verify `aria-label` is present on the `<canvas>` element; verify surrounding UI is keyboard-accessible |

### Reduced motion

| Tier | Name | What it checks |
|------|------|----------------|
| E2E | `test_a11y_reduced_motion_no_animation` | With `prefers-reduced-motion: reduce` set, Connect4 drop animation and win animations do not play |
