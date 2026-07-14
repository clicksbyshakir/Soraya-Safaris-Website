# Launch QA Checklist

Date: July 14, 2026
Build tested: local static build served from `dist/` at `http://127.0.0.1:4174`
Canonical test origin: `https://example.com` fallback via `PUBLIC_SITE_URL`

> The audit below was run before the domain and company name were confirmed, so it
> records `example.com` and `{{COMPANY_NAME}}` placeholders. Those are now replaced
> with `sorayasafaris.com` and `Soraya Safaris` in the repository. The structural
> results (Lighthouse, responsive, SEO, structured data) still hold; the items under
> Production Launch Blockers are what remain.

## Build And Static Output

- [x] `npm run check` completed with 0 errors, 0 warnings, 0 hints.
- [x] `npm run build` completed with 13 pages built and no build warnings.
- [x] Static output mode confirmed in `astro.config.mjs`.
- [x] `@astrojs/sitemap` generated `dist/sitemap-index.xml` and `dist/sitemap-0.xml`.
- [x] `dist/robots.txt` resolves and points to `https://example.com/sitemap-index.xml`.
- [x] `dist/rss.xml` resolves.

## Lighthouse

All pages were audited with Lighthouse against the final production build.

| Route | Performance | Accessibility | Best Practices | SEO |
| --- | ---: | ---: | ---: | ---: |
| `/` | 99 | 100 | 100 | 100 |
| `/about/` | 99 | 100 | 100 | 100 |
| `/our-story/` | 99 | 100 | 100 | 100 |
| `/destinations/` | 98 | 100 | 100 | 100 |
| `/contact/` | 99 | 100 | 100 | 100 |
| `/blog/` | 100 | 100 | 100 | 100 |
| `/blog/first-safari-planning-note/` | 96 | 100 | 100 | 100 |
| `/blog/kenya-travel-season-sample/` | 99 | 100 | 100 | 100 |
| `/blog/kitchen-sink-safari-planning-sample/` | 98 | 100 | 100 | 100 |
| `/blog/tag/kenya/` | 100 | 100 | 100 | 100 |
| `/blog/tag/planning/` | 100 | 100 | 100 | 100 |
| `/blog/tag/sample/` | 100 | 100 | 100 | 100 |
| `/404.html` | 99 | 100 | 100 | 100 |

Result: all audited pages meet the 95+ target in every Lighthouse category.

## Responsive Routes

All 13 page routes were tested at 360px, 768px, and 1440px viewports.

- [x] 39 viewport-route checks completed.
- [x] No missing H1s.
- [x] No horizontal overflow detected.
- [x] No broken visible images detected.

## SEO And Metadata

- [x] Every HTML page has a unique title.
- [x] Every title follows the required `Page | {{COMPANY_NAME}} — Kenya Safaris` pattern.
- [x] Every HTML page has a unique meta description.
- [x] Canonical URLs resolve from `PUBLIC_SITE_URL`.
- [x] Canonical URL paths normalize without trailing slashes, except the root.
- [x] Default Open Graph image exists at `/og-default.png`.
- [x] Open Graph and Twitter card tags are present on all pages.
- [x] No real company name is hardcoded in `src/`, `public/`, README, or deployment docs.
- [x] No Google Analytics, `gtag`, or Google Tag Manager code is present.

## Structured Data

- [x] Home page includes `Organization` JSON-LD.
- [x] Home page includes `TravelAgency` JSON-LD.
- [x] Blog posts include `BlogPosting` JSON-LD.
- [x] Breadcrumb JSON-LD is present where sensible: page sections, blog index, tags, and posts.

## Discovery Files

- [x] `robots.txt` resolves locally.
- [x] `sitemap-index.xml` resolves locally.
- [x] `sitemap-0.xml` resolves locally.
- [x] `rss.xml` resolves locally.
- [x] Sitemap excludes `404` and includes all public content routes.

## Redirects And Normalization

- [x] `public/_redirects` redirects `www.example.com` to `example.com`.
- [x] `public/_redirects` normalizes common trailing-slash routes to no trailing slash.
- [x] Replaced `example.com` with the apex production domain `sorayasafaris.com`.

## Analytics

- [x] Cloudflare Web Analytics is wired in the base layout.
- [x] Cloudflare Web Analytics is wired in the blog layout.
- [x] Analytics script is injected only when `PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN` is present.
- [x] README documents where the Cloudflare Web Analytics token goes.
- [x] No consent banner is required for this cookieless analytics setup.

## Icons And Manifest

- [x] `favicon.svg` exists.
- [x] `icon-192.png` exists.
- [x] `icon-512.png` exists.
- [x] `apple-touch-icon.png` exists.
- [x] `site.webmanifest` exists and references placeholder icons.
- [x] Theme color is present in layouts and manifest.

## Forms

- [x] Contact page renders the `Book a Safari` inquiry form.
- [x] Inquiry Worker dry-run success path returned HTTP 200 with the expected success page.
- [x] Form does not collect payment details.
- [ ] Production notification path must be retested after real Worker secrets are configured: `RESEND_API_KEY`, `INQUIRY_TO_EMAIL`, `RESEND_FROM_EMAIL`, and optional Telegram/Turnstile secrets.

## Links

- [x] Local route and asset audit checked 21 built paths.
- [x] No broken internal links found in rendered pages.
- [x] Primary discovery assets resolve: `/robots.txt`, `/rss.xml`, `/sitemap-index.xml`, `/sitemap-0.xml`, `/favicon.svg`, `/site.webmanifest`, `/og-default.png`, and `/_redirects`.

## Social Preview

- [x] Local rendered pages include valid `og:title`, `og:description`, `og:url`, `og:image`, `twitter:card`, `twitter:title`, `twitter:description`, and `twitter:image`.
- [x] Default OG image is 1200x630.
- [ ] Telegram, iMessage, and WhatsApp live unfurl tests must be completed after the production domain is deployed and `PUBLIC_SITE_URL` is set to that domain.

## Production Launch Blockers

Done in the repository:

- [x] Replaced `example.com` in `public/_redirects`, `astro.config.mjs`, `src/lib/site.ts`, and `workers/inquiry/wrangler.toml`.
- [x] Replaced `{{COMPANY_NAME}}` with `Soraya Safaris` across `src/`, `public/`, and the Worker.
- [x] Set `INQUIRY_TO_EMAIL` and `RESEND_FROM_EMAIL` to `admin@sorayasafaris.com`.

Still required, outside the repository:

- [ ] Push to a private GitHub repository and connect Cloudflare Pages.
- [ ] Set `PUBLIC_SITE_URL` to `https://sorayasafaris.com`.
- [ ] Set `PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN`.
- [ ] Set `PUBLIC_INQUIRY_ENDPOINT` to the deployed inquiry Worker URL or routed path.
- [ ] Configure Worker secrets: `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- [ ] Verify `sorayasafaris.com` as a sending domain in Resend, or the from-address will be rejected.
- [ ] Run a real form notification test after Worker secrets are configured.
- [ ] Run Telegram, iMessage, and WhatsApp unfurl checks against production URLs.
- [ ] Replace placeholder favicon, icons, and OG image with real brand assets from `brand/`.
- [ ] Replace the four sample blog posts with real content.
