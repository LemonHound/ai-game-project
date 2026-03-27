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

## Open Questions

- Which React library for managing document head? (`react-helmet-async` or the newer React 19 built-in
  document metadata API?)
- What are the target keywords or search queries for each page?
- Are there any pages that should be excluded from indexing (e.g., `/settings`, `/profile`)?
- Should game pages be indexable? (They require interaction to be useful, but a landing description helps)
- Is there a Google Search Console account to register the site with?
- Open Graph images: do we want custom preview images per page, or a single site-wide default?

## Test Cases

_To be defined during planning session._
