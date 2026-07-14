# Deployment

This site deploys as a static Astro build on Cloudflare Pages. Dynamic behavior belongs in separate Cloudflare Workers, not in the Astro site.

## 1. Prepare the GitHub Repository

1. Create a private GitHub repository.
2. Push this project to the `main` branch.
3. Confirm the GitHub Actions CI workflow passes on `main`.

Cloudflare Pages will deploy from GitHub. The workflow in `.github/workflows/ci.yml` is only a pre-deploy safety check.

## 2. Connect Cloudflare Pages

1. In Cloudflare, open Workers & Pages.
2. Select Create application.
3. Select Pages.
4. Select Import an existing Git repository.
5. Authorize the private GitHub repository and begin setup.
6. Use these settings:

```text
Production branch: main
Build command: npm run build
Build output directory: dist
Root directory: /
Node version: 22.16.0
```

Use the Cloudflare Pages v3 build image where available. The repository includes `.node-version` so Pages can select Node `22.16.0`.

## 3. Environment Variables

The static Astro site does not require secrets, but it does use public build variables:

```text
PUBLIC_SITE_URL=https://example.com
PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN=<Cloudflare Web Analytics token>
PUBLIC_INQUIRY_ENDPOINT=<deployed inquiry Worker URL or routed path>
```

Use the apex domain in `PUBLIC_SITE_URL`. Do not include a trailing slash.

Set future Worker secrets in Cloudflare, not in the repository:

```text
RESEND_API_KEY
INQUIRY_TO_EMAIL
RESEND_FROM_EMAIL
TURNSTILE_SECRET_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

Only add GitHub Actions secrets for the external blog pipeline if that pipeline is active:

```text
ANTHROPIC_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

## 4. Custom Domain

1. In the Pages project, open Custom domains.
2. Add the apex domain, for example `example.com`.
3. Add `www.example.com` if the site should answer on `www`.
4. Follow Cloudflare's verification prompts.
5. Use the apex as canonical. The checked-in `public/_redirects` file redirects `www` to the apex after `example.com` is replaced with the confirmed production domain.

Typical DNS records for Cloudflare Pages:

```text
Type   Name   Target
CNAME  www    <project>.pages.dev
```

For the apex domain, use the record Cloudflare creates or recommends for the Pages custom domain. If the domain is fully on Cloudflare nameservers, Cloudflare can flatten the apex record internally.

## 5. Move Nameservers Carefully

Before changing nameservers to Cloudflare, export or screenshot the current DNS zone.

Recreate all required records in Cloudflare before or immediately after the nameserver move:

- Existing website records that still matter
- Google Workspace MX records
- SPF TXT record
- DKIM TXT record from Google Workspace
- DMARC TXT record
- Any verification TXT records
- Any subdomain records used by business tools

## 6. Google Workspace DNS

When nameservers move to Cloudflare, Google Workspace mail will stop working unless its DNS records are recreated in the Cloudflare zone.

Add Google Workspace MX records at the apex domain:

```text
Type  Name  Mail server                  Priority  Proxy
MX    @     ASPMX.L.GOOGLE.COM           1         DNS only
MX    @     ALT1.ASPMX.L.GOOGLE.COM      5         DNS only
MX    @     ALT2.ASPMX.L.GOOGLE.COM      5         DNS only
MX    @     ALT3.ASPMX.L.GOOGLE.COM      10        DNS only
MX    @     ALT4.ASPMX.L.GOOGLE.COM      10        DNS only
```

Also recreate Google Workspace security records:

```text
Type  Name     Value
TXT   @        v=spf1 include:_spf.google.com ~all
TXT   google._domainkey  <value generated in Google Admin>
TXT   _dmarc   <policy chosen by the owner>
```

Confirm the exact DKIM selector and DMARC policy in Google Admin before launch.

## 7. Post-Deploy Checks

1. Confirm Pages deploys `main` successfully.
2. Visit `/`, `/about`, `/destinations`, `/contact`, `/blog`, and each sample `/blog/[slug]` route.
3. Visit `/robots.txt`, `/sitemap-index.xml`, and `/rss.xml`.
4. Confirm `/about/`, `/destinations/`, `/contact/`, and `www` URLs redirect to their canonical apex, no-trailing-slash URLs.
5. Confirm draft blog posts do not appear in production builds.
6. Confirm Google Workspace can send and receive mail after the DNS move.
7. Confirm no secrets are present in the repository or static build output.
