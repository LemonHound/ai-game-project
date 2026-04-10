# Feature: PlayerCard

**Status: ready**

## Background

Game pages needed a visual representation of each participant — both the human player and the AI opponent. Previously,
game outcome was displayed as a plain `alert` element that resembled a non-interactive button. This spec describes a
self-contained `PlayerCard` component that replaces that pattern and establishes the canonical location for per-game
participant context across all game pages.

## Goals

- Display the AI opponent above the board and the human player below the board on any game page.
- Surface real-time AI status messages ("Thinking...", "Considering the board...") inside the AI card, replacing the
  spinner-and-text row that previously lived between the board and the controls.
- Show the game outcome (win / loss / draw) inside each card once the game reaches a terminal state, replacing the
  `alert` element.
- Be self-contained: each card fetches or receives only the props it needs. Game pages pass data down; cards do not
  reach into global state.
- Apply to all current and future game pages as a single source of truth.

## Component API

```tsx
interface PlayerCardProps {
    name: string;
    avatarUrl?: string;   // profile picture URL; falls back to initials (player) or bot icon (AI)
    isAi?: boolean;       // true → bot icon avatar, "AI" role label
    symbol?: string;      // game symbol, e.g. "X" or "O" — omit when no game is active
    statusText?: string;  // real-time status from SSE; shown only when truthy (AI card only)
    result?: 'win' | 'loss' | 'draw' | null;
}
```

**Result label copy:**

| result  | AI card   | Player card  |
|---------|-----------|--------------|
| `win`   | Wins!     | You Win!     |
| `loss`  | Loses     | You Lose     |
| `draw`  | Draw      | Draw         |

`statusText` takes display priority over `result` — if both are present, `statusText` is shown. This prevents a flash
of the result badge while a status update is still in flight (not expected in practice, but safe by default).

## Layout

```
[ AI card    ]   ← above board: bot avatar | name | symbol | statusText or result
[ Board      ]
[ Player card]   ← below board: user avatar/initials | display name | symbol | result
```

The card is a horizontal flex row: avatar on the left, name + secondary info stacked on the right.

Avatar fallback priority:
1. `avatarUrl` (profile picture)
2. First letter of `name`, on a colored circle (player)
3. Inline SVG bot icon (AI)

## Phases and Visibility

| Phase          | AI symbol | Player symbol | AI statusText | Result badges |
|----------------|-----------|---------------|---------------|---------------|
| `loading`      | hidden    | hidden        | hidden        | hidden        |
| `newgame`      | hidden    | hidden        | hidden        | hidden        |
| `resumeprompt` | shown     | shown         | hidden        | hidden        |
| `playing`      | shown     | shown         | shown         | hidden        |
| `terminal`     | shown     | shown         | hidden        | shown         |

## Future Extensions

- Per-game stats (wins, streak, win rate) pulled from the game-statistics API — stubbed as `--` until that feature ships.
- Custom AI avatars per game (e.g., a chess knight for Chess, a fox for TTT).
- Player rank or title badge.
- Opponent profile card for future multiplayer modes.

## File Location

`src/frontend/src/components/PlayerCard.tsx`

One component, no sub-files. Game pages import it directly.

## Test Cases

### Unit

| Test name | Scenario |
|---|---|
| `test_player_card_renders_name_and_symbol` | name and symbol render when provided |
| `test_player_card_shows_status_text_over_result` | statusText displayed when both statusText and result present |
| `test_player_card_result_labels_ai` | win/loss/draw map to correct AI copy |
| `test_player_card_result_labels_player` | win/loss/draw map to correct player copy |
| `test_player_card_avatar_fallback_initials` | renders first letter when no avatarUrl and isAi false |
| `test_player_card_avatar_fallback_bot` | renders bot icon when isAi true |

### Manual

| Scenario |
|---|
| AI status text ("Thinking...") appears inside the AI card during AI turn, disappears on AI move |
| Result badge appears in both cards simultaneously on game end |
| Cards render correctly at 375px wide without overflow |
