# Site Presence Spec

## Goal

Make the site feel like a real product with a human story behind it. Users should be able to learn who built
this, why it exists, and have a frictionless way to support the project financially.

## Scope

- About page: who Brian and [your name] are, the story behind the project
- Support / "buy me a coffee" integration: a way for users to offset hosting and ML model training costs
- Potentially: social links, contact info, project updates/changelog

## Known Requirements

- About page exists as a stub at `/about` — needs real content and layout
- Support option must be low-friction (external link or embedded widget — no payment processing in-house)
- Should work on mobile and desktop
- Support prompt should be visible but not intrusive — not a popup or blocker

## Open Questions

### About Page Content
- What should the tone be? (Personal/casual vs. professional?)
- How much detail about each person? (Bio, photo, links to other work?)
- Should the project origin story be included? (Why this site, what's the goal?)
- Is there a roadmap or "what's coming" section?

### Support Integration
- Which platform: Buy Me a Coffee, Ko-fi, GitHub Sponsors, Patreon, or direct PayPal/Stripe?
- Embedded widget in the page, or just a link/button that opens an external page?
- Where does the support CTA appear: only on the About page, in the footer, or both?
- Should there be a goal meter showing how close costs are being covered?
- When the ML model is running, do we want to communicate its cost to users to contextualize the ask?

### Social / Contact
- Which social accounts should be linked (GitHub, LinkedIn, X/Twitter)?
- Should there be a contact form, or just an email link?
- Is there a Discord or community space planned?

## Test Cases

_To be defined during planning session._
