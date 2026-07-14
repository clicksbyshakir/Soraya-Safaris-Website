# Soraya Safaris Website

Static marketing site for Soraya Safaris, a Kenya safari company serving North American travelers. The canonical production origin is `https://sorayasafaris.com`.

## Stack

- Astro, static output mode
- TypeScript strict mode
- Plain CSS in `src/styles/global.css`
- Markdown blog posts in an Astro content collection
- Cloudflare Pages for static hosting from the private GitHub repository
- Cloudflare Workers for dynamic functionality such as forms and future payment helpers
- Google Workspace for email, with transactional sending handled by Workers through Resend

No CMS, database, SSR adapter, client-side framework, or checkout flow is included in this scaffold.

## Folder Structure

```text
.
├── .github/workflows/ci.yml
├── astro.config.mjs
├── src/
│   ├── content.config.ts
│   ├── content/
│   │   ├── config.ts
│   │   └── blog/
│   ├── layouts/BaseLayout.astro
│   ├── components/
│   ├── pages/
│   │   ├── index.astro
│   │   ├── about.astro
│   │   ├── destinations.astro
│   │   ├── contact.astro
│   │   └── blog/
│   │       ├── index.astro
│   │       └── [slug].astro
│   └── styles/global.css
└── workers/
```

The Astro build uses `src/pages/` and outputs to `dist/`. Source brand logos live in `brand/` and are not served by the build; web-ready images belong in `public/assets/`.

## Local Development

```sh
npm install
npm run dev
npm run check
npm run build
npm run preview
```

Use Node `22.16.0` or newer. The checked-in `.node-version` pins Cloudflare Pages and GitHub Actions to `22.16.0`.

## Blog Content Contract

The external automated blog pipeline must write valid Markdown files to `src/content/blog/`. The Astro collection schema is defined in `src/content/config.ts` and loaded through `src/content.config.ts`.

A valid post file looks like this:

```md
---
title: "Best Time to Plan a Private Kenya Safari"
description: "A practical guide to Kenya safari timing, seasons, pacing, and how to choose the right months for your group."
pubDate: 2026-07-01
heroImage: "/assets/blog/best-time-kenya-safari.jpg"
tags:
  - planning
  - seasons
draft: false
---

Opening paragraph goes here. The body should start after the closing frontmatter fence and use normal Markdown.

## Use H2 headings for main sections

Paragraph text, lists, links, blockquotes, images, tables, and code blocks are supported by the post template.
```

Field contract:

- `title`: required string. Used for the page H1, card title, Open Graph title, and Twitter title.
- `description`: required string. Used for the card summary, meta description, RSS description, Open Graph description, and Twitter description.
- `pubDate`: required date in `YYYY-MM-DD` format. Future-dated posts are excluded from the index, post routes, RSS, and sitemap until their date arrives.
- `heroImage`: optional string. Use a root-relative public asset path such as `/assets/blog/filename.jpg`. If omitted, the blog uses the default site social image.
- `tags`: optional array of strings. Posts with no tags render normally and simply omit tag links.
- `draft`: optional boolean, defaults to `false`. Posts with `draft: true` are excluded from the index, post routes, RSS, and sitemap.

Blog images should live in `public/assets/blog/` and be referenced from Markdown or frontmatter with root-relative paths like `/assets/blog/amboseli-elephants.jpg`. Images shared with other pages may live in `public/assets/`.

The post URL comes from the filename, not from a frontmatter `slug`. For example, `src/content/blog/best-time-kenya-safari.md` builds at `/blog/best-time-kenya-safari`.

Invalid frontmatter fails Astro content validation during `npm run check` and `npm run build`. In CI or Cloudflare Pages, that means the deployment stops and the post is not published until the frontmatter is fixed.

Set `PUBLIC_SITE_URL` in Cloudflare Pages to the apex production origin, `https://sorayasafaris.com`. Blog canonical URLs, RSS links, sitemap entries, and social image URLs use that value. Builds without the variable set fall back to the same apex origin.

## Analytics and Public Build Variables

Cloudflare Web Analytics is the only analytics script used. Do not add Google Analytics.

Set these non-secret Cloudflare Pages environment variables:

- `PUBLIC_SITE_URL`: canonical apex origin, such as `https://sorayasafaris.com`.
- `PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN`: Cloudflare Web Analytics token from the Web Analytics dashboard. The layout injects Cloudflare's cookieless beacon only when this value is present.
- `PUBLIC_INQUIRY_ENDPOINT`: deployed Cloudflare Worker URL or routed path for the `/contact` Book a Safari form.

The Web Analytics token is public by design; Worker API keys and email/payment secrets still belong only in Worker environment variables.

## Routes

- `/`
- `/about`
- `/our-story`
- `/destinations`
- `/contact`
- `/blog`
- `/blog/[slug]`
- `/rss.xml`
- `/robots.txt`
- `/sitemap-index.xml`
- `/404`

The contact page renders a static `Book a Safari` inquiry form that posts to `PUBLIC_INQUIRY_ENDPOINT`. The form does not collect passport, medical, or payment details. Payment remains manual via future Stripe payment links.

## CI

GitHub Actions runs on every pull request and every push to `main`:

1. `npm ci`
2. `npm run check`
3. `npm run build`

Cloudflare Pages performs the actual deployment from `main`; CI is a safety net before changes are merged or deployed.

## Secrets

No secrets belong in this repository.

Inquiry Worker secrets, set with `wrangler secret put`:

- `RESEND_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TURNSTILE_SECRET_KEY` (optional; the Turnstile check is skipped when unset)
- `STRIPE_SECRET_KEY` (future)
- `STRIPE_WEBHOOK_SECRET` (future)

Inquiry Worker non-secret vars, set in `workers/inquiry/wrangler.toml` under `[vars]`:

- `ALLOWED_ORIGIN`: production origin allowed to post the form.
- `INQUIRY_TO_EMAIL`: inbox that receives inquiry notifications.
- `RESEND_FROM_EMAIL`: verified Resend sender, such as `Soraya Safaris <admin@sorayasafaris.com>`.

These names must match `workers/inquiry/src/index.js` exactly. The Worker throws `Missing env var` and the submission fails if any required name is wrong.

GitHub Actions secrets for the external blog automation, if enabled:

- `ANTHROPIC_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

The static Astro site must never read email, payment, or automation secrets directly.
