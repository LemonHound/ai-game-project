# SEO Spec

**Status: ready**

## Priority: Low

This feature is low priority and may not be addressed for some time. It is documented here to avoid
the work being forgotten as the site matures.

## Background

The site is a React single-page application (SPA). Search engines receive a mostly-empty HTML shell when
they crawl the site because content is rendered client-side by JavaScript. Most pages — especially game
pages — are interactive experiences where organic search traffic may not be the primary acquisition channel.
However, the home page, games list, and about page have static-enough content that basic SEO improvements
are worthwhile.

## Scope

Improve search engine discoverability without requiring a full server-side rendering (SSR) migration:
- Per-page `<title>` and `<meta>` description tags managed by React
- Open Graph tags (for link previews in social/messaging apps)
- `sitemap.xml` generation
- `robots.txt`
- Structured data (JSON-LD) for the games list (optional, future)

## Known Requirements

- Must not require migrating from Vite/React to a SSR framework (Next.js, Remix) — that is out of scope
- Per-page titles and meta tags must update dynamically as the user navigates (React-managed)
- sitemap.xml should be generated from the known route list and served by FastAPI
- robots.txt should be served as a static file

## Decisions

### Head management

Use **React 19 built-in document metadata**. React 19 natively supports `<title>`, `<meta>`, and
`<link>` tags in component JSX — they automatically hoist to `<head>`. No third-party library needed.
The project is already on React 19.2.4.

### Indexing strategy

**Indexable pages** (included in sitemap, no robots restrictions):
- `/` (Home)
- `/games` (Games list)
- `/about` (About)

**Noindex pages** (add `<meta name="robots" content="noindex" />`):
- `/game/*` (all individual game pages — interactive, not content-heavy)
- `/profile`
- `/settings`
- `*` (404 / not found)

### Open Graph images

**Per-page custom images.** Each indexable page gets its own OG preview image for better social sharing.
Game pages do not need OG images since they are noindexed. Images stored in `public/images/og/`.

| Page | OG Image |
|------|----------|
| `/` | `og-home.png` — site hero/logo |
| `/games` | `og-games.png` — collage or grid of game icons |
| `/about` | `og-about.png` — team or project visual |

Image dimensions: 1200x630px (standard OG size). Placeholder images can be used initially.

### Keywords and Google Search Console

Target keywords are deferred — not needed for the initial implementation. Google Search Console
registration is a manual post-deploy step, not part of this spec.

## Implementation

### 1. Per-page metadata component

Create a reusable `PageMeta` component in `src/frontend/src/components/PageMeta.tsx`:

```tsx
interface PageMetaProps {
    title: string;
    description: string;
    ogImage?: string;
    noindex?: boolean;
}
```

Each page renders `<PageMeta>` in its JSX. React 19 hoists the `<title>` and `<meta>` tags to
`<head>` automatically. The component renders:
- `<title>{title} | AI Game Hub</title>`
- `<meta name="description" content={description} />`
- `<meta property="og:title" content={title} />`
- `<meta property="og:description" content={description} />`
- `<meta property="og:image" content={ogImage} />` (if provided)
- `<meta property="og:type" content="website" />`
- `<meta name="robots" content="noindex" />` (if `noindex` is true)

### 2. Add metadata to each page

| Page | Title | Description | noindex |
|------|-------|-------------|---------|
| `/` | "AI Game Hub" | "Play classic games against adaptive AI opponents that learn your style." | no |
| `/games` | "Games" | "Browse all available games — from Tic Tac Toe to Chess, each with an adaptive AI opponent." | no |
| `/about` | "About" | "Meet the team behind AI Game Hub and see live platform stats." | no |
| `/game/tic-tac-toe` | "Tic Tac Toe" | "Play Tic Tac Toe against an AI that adapts to your strategy." | yes |
| `/game/chess` | "Chess" | "Challenge an adaptive AI in a game of Chess." | yes |
| `/game/checkers` | "Checkers" | "Play Checkers against an AI opponent." | yes |
| `/game/connect4` | "Connect 4" | "Drop pieces and outsmart the AI in Connect 4." | yes |
| `/game/dots-and-boxes` | "Dots and Boxes" | "Compete against AI in Dots and Boxes." | yes |
| `/game/pong` | "Pong" | "Play real-time Pong against an AI opponent." | yes |
| `/profile` | "Profile" | (none needed) | yes |
| `/settings` | "Settings" | (none needed) | yes |

### 3. robots.txt

Serve as a static file from FastAPI. Create `src/backend/static/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /profile
Disallow: /settings
Disallow: /game/

Sitemap: https://aigamehub.com/sitemap.xml
```

Add a dedicated route in `app.py` before the SPA catch-all:
```python
@app.get("/robots.txt")
async def robots_txt():
    return FileResponse("static/robots.txt", media_type="text/plain")
```

### 4. sitemap.xml

Serve dynamically from FastAPI. Create a route `GET /sitemap.xml` that returns XML listing the
indexable pages:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://aigamehub.com/</loc></url>
  <url><loc>https://aigamehub.com/games</loc></url>
  <url><loc>https://aigamehub.com/about</loc></url>
</urlset>
```

The base URL should come from an environment variable (`WEBSITE_URL`), which already exists in the
CORS config. The route list is hardcoded (only 3 indexable pages). No dynamic generation needed.

### 5. Update index.html

Add fallback meta tags to `src/frontend/index.html` `<head>` for crawlers that don't execute JS:

```html
<meta name="description" content="Play classic games against adaptive AI opponents that learn your style." />
<meta property="og:title" content="AI Game Hub" />
<meta property="og:description" content="Play classic games against adaptive AI opponents that learn your style." />
<meta property="og:image" content="/images/og/og-home.png" />
<meta property="og:type" content="website" />
```

These are overridden by React 19 on client-side navigation but serve as defaults for non-JS crawlers.

### 6. OG images

Add placeholder images to `src/frontend/public/images/og/`:
- `og-home.png` (1200x630)
- `og-games.png` (1200x630)
- `og-about.png` (1200x630)

Placeholder images can be simple branded cards with the page title. Replace with designed images
before launch.

## Files to Create/Modify

| Action | File |
|--------|------|
| Create | `src/frontend/src/components/PageMeta.tsx` |
| Create | `src/backend/static/robots.txt` |
| Create | `src/frontend/public/images/og/og-home.png` (placeholder) |
| Create | `src/frontend/public/images/og/og-games.png` (placeholder) |
| Create | `src/frontend/public/images/og/og-about.png` (placeholder) |
| Modify | `src/frontend/index.html` — add fallback meta tags |
| Modify | `src/backend/app.py` — add `/robots.txt` and `/sitemap.xml` routes |
| Modify | `src/frontend/src/pages/AboutPage.tsx` — add `<PageMeta>` |
| Modify | `src/frontend/src/pages/HomePage.tsx` — add `<PageMeta>` |
| Modify | `src/frontend/src/pages/GamesPage.tsx` — add `<PageMeta>` |
| Modify | All game page components — add `<PageMeta noindex>` |
| Modify | `src/frontend/src/pages/ProfilePage.tsx` — add `<PageMeta noindex>` |
| Modify | `src/frontend/src/pages/SettingsPage.tsx` — add `<PageMeta noindex>` |

## Test Cases

| Tier | Name | What it checks |
|------|------|----------------|
| API integration | `GET /robots.txt returns valid content` | Returns 200, content-type text/plain, contains Disallow directives |
| API integration | `GET /sitemap.xml returns valid XML` | Returns 200, content-type XML, contains all 3 indexable URLs |
| E2E | `Home page has correct title and meta tags` | Navigate to `/`, verify `<title>` contains "AI Game Hub", OG tags present |
| E2E | `Games page has correct meta description` | Navigate to `/games`, verify description meta tag content |
| E2E | `Game page has noindex meta tag` | Navigate to `/game/tic-tac-toe`, verify robots noindex meta tag is present |
| E2E | `About page has correct OG image` | Navigate to `/about`, verify og:image meta tag points to correct image |
| Manual | `Social preview renders correctly` | Share a page URL in Slack/Discord and verify the link preview card |
| Manual | `OG images replaced before launch` | Verify placeholder images have been replaced with designed versions |
