# Workers

Cloudflare Workers for dynamic functionality live here, separate from the static Astro build.

Planned Workers:

- Inquiry form handler that validates submissions, rate limits requests, and sends email through Resend.
- Future payment helper for manually issued Stripe payment links.

Secrets must be configured in Cloudflare environment variables, never committed to this repository.

Expected secret and environment variable names:

- `RESEND_API_KEY`
- `CONTACT_TO_EMAIL`
- `CONTACT_FROM_EMAIL`
- `TURNSTILE_SECRET_KEY`
- `STRIPE_SECRET_KEY` (future)
- `STRIPE_WEBHOOK_SECRET` (future)
