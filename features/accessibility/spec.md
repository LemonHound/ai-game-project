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

## Open Questions

- What WCAG level is the target: A, AA, or AAA?
- Which screen readers should be tested against? (NVDA/Windows, VoiceOver/macOS+iOS, TalkBack/Android)
- Should game boards have an alternative text-based interface for screen reader users, or just state
  announcements via ARIA live regions?
- Is there a plan to add reduced-motion support for any animations (win animations, transitions)?
- Who performs the accessibility audit — automated tools (axe, Lighthouse) only, or manual testing too?
- Are there any legal/compliance requirements (e.g., ADA in the US) that would elevate the priority?

## Test Cases

_To be defined during planning session._
