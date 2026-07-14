# Inquiry Worker

Cloudflare Worker endpoint for the `Book a Safari` form on `/contact`.

The static Astro page should set:

- `PUBLIC_INQUIRY_ENDPOINT`: full Worker URL used as the form action.
- `PUBLIC_TURNSTILE_SITE_KEY`: public Cloudflare Turnstile site key for invisible mode.

## Environment variables

Set secrets with `wrangler secret put NAME`. Do not commit secret values.

- `ALLOWED_ORIGIN`: production site origin allowed by CORS, for example `https://sorayasafaris.com`.
- `TELEGRAM_BOT_TOKEN`: Telegram bot token.
- `TELEGRAM_CHAT_ID`: Telegram group chat ID.
- `RESEND_API_KEY`: Resend API key.
- `INQUIRY_TO_EMAIL`: inbox that receives founder/internal notifications.
- `RESEND_FROM_EMAIL`: verified Resend sender, for example `Soraya Safaris <admin@sorayasafaris.com>`.
- `TURNSTILE_SECRET_KEY`: Cloudflare Turnstile secret key.
- `TURNSTILE_REQUIRED`: set to `true` to reject submissions without a Turnstile token. Leave `false` if no-JavaScript form posts must remain accepted.
- `MIN_SUBMIT_SECONDS`: minimum seconds between form render and submission. Defaults to `3`.
- `RATE_LIMIT_WINDOW_SECONDS`: per-isolate IP rate limit window. Defaults to `900`.
- `RATE_LIMIT_MAX_REQUESTS`: requests allowed per IP window. Defaults to `5`.
- `DRY_RUN`: local testing mode. Set to `true` to skip Telegram and Resend network calls.

## Local testing

From this directory:

```sh
wrangler dev
```

For a no-network success path:

```sh
DRY_RUN=true ALLOWED_ORIGIN=http://localhost:4321 wrangler dev
```

Valid request:

```sh
curl -i http://127.0.0.1:8787 \
  -H 'Origin: http://localhost:4321' \
  -H 'Accept: application/json' \
  -F 'fullName=Amina Example' \
  -F 'email=amina@example.com' \
  -F 'travelDates=August 2026' \
  -F 'groupSize=3-5' \
  -F 'message=We are planning a first Kenya safari with a thoughtful pace and time in the Mara.' \
  -F 'heardAbout=Search' \
  -F "formStartedAt=$(($(date +%s%3N)-5000))"
```

Malformed request:

```sh
curl -i http://127.0.0.1:8787 \
  -H 'Origin: http://localhost:4321' \
  -H 'Accept: application/json' \
  -F 'fullName=A' \
  -F 'email=not-an-email' \
  -F 'message=short' \
  -F "formStartedAt=$(($(date +%s%3N)-5000))"
```

Honeypot spam request:

```sh
curl -i http://127.0.0.1:8787 \
  -H 'Origin: http://localhost:4321' \
  -H 'Accept: application/json' \
  -F 'fullName=Spam Bot' \
  -F 'email=bot@example.com' \
  -F 'message=This should be skipped by the honeypot.' \
  -F 'companyWebsite=https://spam.example' \
  -F "formStartedAt=$(($(date +%s%3N)-5000))"
```

Too-fast request:

```sh
curl -i http://127.0.0.1:8787 \
  -H 'Origin: http://localhost:4321' \
  -H 'Accept: application/json' \
  -F 'fullName=Amina Example' \
  -F 'email=amina@example.com' \
  -F 'message=We are planning a Kenya safari with a thoughtful pace.' \
  -F "formStartedAt=$(date +%s%3N)"
```

## Deployment

1. Create the Turnstile widget in Cloudflare and set the site key as `PUBLIC_TURNSTILE_SITE_KEY` for the Astro/Pages build.
2. Set `PUBLIC_INQUIRY_ENDPOINT` on the Astro/Pages build to the deployed Worker URL.
3. Set non-secret Worker vars in `wrangler.toml` or with `wrangler secret put` if you prefer central management.
4. Add secrets:

```sh
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
wrangler secret put RESEND_API_KEY
wrangler secret put TURNSTILE_SECRET_KEY
```

5. Deploy:

```sh
wrangler deploy
```

## Behavior

- Telegram, internal email, and customer auto-reply are attempted independently.
- The customer receives success if Telegram or the internal email succeeds.
- Failures are logged without exposing secrets or raw provider responses to the visitor.
- The Google Sheets append step is intentionally left as a documented TODO hook in `src/index.js`.
