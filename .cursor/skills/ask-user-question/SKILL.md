---
name: ask-user-question
description: Structures blocking clarification requests as labeled options with context and a recommendation, then stops until the user replies. Use when requirements are ambiguous, multiple reasonable interpretations change behavior or APIs, or the next step is costly to revert; skip when specs, repo patterns, or low-risk assumptions already decide the path.
---

# Ask user question

## When to use

- A **product or technical fork** is not specified and changes behavior, data shape, public API, security, or UX.
- **Several reasonable readings** exist and picking wrong wastes time or risks rework.
- The next edit is **hard to undo** (migrations, contracts, billing, compliance).

## When not to use

- CONTRIBUTING, `spec.md`, tickets, or existing code already answer it: **follow them**.
- Risk is low and you can **match local patterns**: state the assumption in one line and continue.
- Background or autonomous runs where you **must not block**: do not use this clarification pattern; choose another policy (spec, safest minimal change) without asking.

## Host tools

If an **AskQuestion** (or similar) tool exists in the environment, use it for the same content you would put in the message (question text plus options). If it does not exist, use the **chat message template** below as the blocking prompt.

## Message template (copy and adapt)

Use **one primary decision** per message.

```markdown
## Context
[2–4 sentences: goal, what you found, why the fork matters]

## Decision needed
[I need you to choose X before I implement Y.]

## Options
- **A** — [behavior] — [tradeoff]
- **B** — [behavior] — [tradeoff]
- **C** — [behavior] — [tradeoff] *(omit C if only two viable paths)*

## Recommendation
**[A/B/C]** — [one concrete reason tied to maintainability, spec alignment, or smallest safe change]

## Next step
**Stopping until you reply.** Do not implement, commit, or push further work on this fork until the user answers.

## Reply format
Reply with **A**, **B**, or **C** (optional: one sentence of extra constraint).
```

## Rules

1. Prefer **two to four labeled options**; avoid open-ended “what do you prefer?” without choices.
2. Ask **one** main question per turn. If a second decision depends on the first, wait for the answer.
3. Always give a **recommendation**. After asking, **stop and wait** for the user’s reply. Do **not** assume a default, proceed with a guess, or continue the same task thread until they answer.
4. After the user answers, **restate the chosen option in one line**, then implement.

## Anti-patterns

- Many questions in one message without clear priority.
- Options that are not **mutually intelligible** (jargon-only labels, no tradeoffs).
- Asking after a **large speculative diff**; ask **before** irreversible edits.
- **Continuing without a reply** after a clarification question (no commits, no pushes, no “I went with B”).

## Optional reference

For longer option matrices or stakeholder notes, add `.cursor/skills/ask-user-question/reference.md` and link it here when needed.
