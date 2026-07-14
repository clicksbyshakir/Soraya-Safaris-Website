# Keys, Tokens, and Where They Go

Every credential the code actually reads, grouped by the flow that needs it, with the exact place to put it.

This list was built by grepping the source for every environment variable, not from the older docs. Where the two disagree, this file is correct. See [Corrections to the older docs](#corrections-to-the-older-docs) at the end.

**Nothing in this list belongs in the repository.** There is no `.env` file to fill in. Secrets live in Cloudflare and GitHub only.

---

## Quick answer: the minimum to launch

The site and the contact form are the only things you need working on day one. That is **five** values:

| # | Value | Where it goes |
| --- | --- | --- |
| 1 | `PUBLIC_SITE_URL` | Cloudflare Pages → environment variables |
| 2 | `PUBLIC_INQUIRY_ENDPOINT` | Cloudflare Pages → environment variables |
| 3 | `PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN` | Cloudflare Pages → environment variables |
| 4 | `RESEND_API_KEY` | Inquiry Worker → secret |
| 5 | Resend domain verification DNS records | Your DNS zone |

Everything below that is optional or belongs to the blog automation, which is not required for launch.

---

## Flow 1 — The website (Cloudflare Pages)

The static site holds **no secrets**. It has three public build variables. They are compiled into the HTML, so treat them as public by design.

**Where:** Cloudflare dashboard → Workers & Pages → your Pages project → Settings → Environment variables → **Production**.

| Variable | Value | What breaks without it |
| --- | --- | --- |
| `PUBLIC_SITE_URL` | `https://sorayasafaris.com` — apex, no trailing slash | Canonical URLs, RSS, sitemap, and social preview links fall back to the apex anyway, so nothing visibly breaks. Set it regardless. |
| `PUBLIC_INQUIRY_ENDPOINT` | The deployed Worker URL from Flow 2, e.g. `https://safari-inquiry.<subdomain>.workers.dev` | **The contact form silently 404s.** It falls back to `/api/inquiry`, which does not exist on a static site. |
| `PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN` | Token from Cloudflare → Web Analytics | No analytics. The beacon is only injected when this is present. |

Set these for the **Production** environment. If you use Preview deployments, set them there too, or previews will point at production.

---

## Flow 2 — The contact form (inquiry Worker)

The "Book a Safari" form posts to a Cloudflare Worker in `workers/inquiry/`. The Worker emails you, emails the guest an auto-reply, and optionally pings Telegram.

### 2a. Non-secret settings

These are plain config, already committed in `workers/inquiry/wrangler.toml` under `[vars]`. Edit the file, do not use the dashboard.

| Variable | Current value | Notes |
| --- | --- | --- |
| `ALLOWED_ORIGIN` | `https://sorayasafaris.com` | Only this origin may post the form. Must match your live domain exactly, or every submission is rejected with a 403. |
| `INQUIRY_TO_EMAIL` | `admin@sorayasafaris.com` | Where inquiries land. |
| `RESEND_FROM_EMAIL` | `Soraya Safaris <admin@sorayasafaris.com>` | Must be on a domain you have verified in Resend (Flow 3). |
| `MIN_SUBMIT_SECONDS` | `3` | Rejects submissions faster than this, as a bot check. |
| `RATE_LIMIT_WINDOW_SECONDS` | `900` | Rate-limit window. |
| `RATE_LIMIT_MAX_REQUESTS` | `5` | Max submissions per IP per window. |
| `TURNSTILE_REQUIRED` | `false` | See Flow 4. |
| `DRY_RUN` | `false` | Set `true` to test the form without sending anything. |

### 2b. Secrets

**Where:** a terminal, from inside `workers/inquiry/`. Never the repo.

```sh
cd workers/inquiry
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN     # optional
npx wrangler secret put TELEGRAM_CHAT_ID       # optional
npx wrangler secret put TURNSTILE_SECRET_KEY   # optional, see Flow 4
```

| Secret | Required? | Where to get it |
| --- | --- | --- |
| `RESEND_API_KEY` | **Yes** | Flow 3 below. Without it, no email is sent and the submitter sees an error. |
| `TELEGRAM_BOT_TOKEN` | No | Flow 5. Gives you an instant phone notification per inquiry. |
| `TELEGRAM_CHAT_ID` | No | Flow 5. Required if you set the bot token. |
| `TURNSTILE_SECRET_KEY` | No | Flow 4. **Currently does nothing** — see the warning there. |

### 2c. Deploy it

```sh
cd workers/inquiry
npx wrangler deploy
```

Copy the URL it prints into `PUBLIC_INQUIRY_ENDPOINT` (Flow 1), then redeploy the Pages site so the form picks it up.

### How the Worker decides success

The form reports success if **either** the Telegram message **or** the internal email succeeds. If both fail it returns a 502 and the guest is told to email directly. The guest auto-reply failing on its own does not fail the submission.

---

## Flow 3 — Email delivery (Resend)

Used by the inquiry Worker for both the notification to you and the auto-reply to the guest.

1. Create an account at [resend.com](https://resend.com).
2. **Add and verify the domain `sorayasafaris.com`.** Resend gives you DNS records — an MX and TXT pair for the bounce/feedback subdomain, plus a DKIM `TXT`. Add them to your DNS zone.
3. Create an API key → put it in the Worker as `RESEND_API_KEY` (Flow 2b).

> **This is the step most likely to bite you.** If the domain is not verified, Resend rejects the `from` address and **every inquiry email fails**, even though the key is set correctly. Verify the domain before you test the form.

If your DNS is moving to Cloudflare (see `DEPLOYMENT.md`), add the Resend records **and** re-add your Google Workspace MX/SPF/DKIM records, or business email stops working.

---

## Flow 4 — Spam protection (Cloudflare Turnstile) — optional, not yet wired

The Worker has full Turnstile support. **The contact form does not render a Turnstile widget.**

That means setting `TURNSTILE_SECRET_KEY` today achieves nothing: with no widget, no token is submitted, and because `TURNSTILE_REQUIRED` is `false` the Worker just logs a warning and continues.

To actually turn it on, all three are needed:

1. Cloudflare → Turnstile → create a widget for `sorayasafaris.com`. You get a **site key** (public) and a **secret key** (private).
2. Add the widget to the form in `src/pages/contact.astro` (a `<div class="cf-turnstile" data-sitekey="...">` plus Cloudflare's script). **This is a code change that has not been made.**
3. `npx wrangler secret put TURNSTILE_SECRET_KEY`, and set `TURNSTILE_REQUIRED = "true"` in `wrangler.toml`.

Until step 2 exists, the form's only real spam defence is the honeypot field and the per-IP rate limit.

---

## Flow 5 — Telegram notifications (optional)

Used in two separate places: instant alerts for new inquiries (Flow 2), and the blog approval bot (Flow 6). They can share one bot.

1. Message [@BotFather](https://t.me/BotFather) on Telegram → `/newbot` → he gives you a **bot token**.
2. Send any message to your new bot, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and read `result[0].message.chat.id`. That is your **chat ID**.

| Value | Goes where |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Inquiry Worker secret (Flow 2b), blog bot Worker secret (Flow 6), and GitHub Actions secret (Flow 6). |
| `TELEGRAM_CHAT_ID` | Inquiry Worker secret (Flow 2b), and GitHub Actions secret (Flow 6). |

---

## Flow 6 — Blog automation (optional, not needed for launch)

This is the most involved flow and **nothing about it is required for the site to run**. The blog works fine as a manually-written folder of Markdown files.

The design: a Telegram bot Worker sends you a draft, you approve it in Telegram, the Worker fires a `repository_dispatch` at GitHub, and a GitHub Actions workflow writes the Markdown file, validates it, commits, and pushes. Cloudflare Pages then deploys.

### 6a. The blog bot Worker (`workers/telegram-blog-bot.js`)

Secrets, via `npx wrangler secret put <NAME>`:

| Secret | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Sends drafts and reads your approval. |
| `TELEGRAM_SECRET_TOKEN` | A string you invent. Telegram echoes it back on every webhook call so the Worker can prove the request really came from Telegram. Set it when registering the webhook with `setWebhook`. |
| `TELEGRAM_ALLOWED_CHAT_ID` | Only this chat may approve posts. Without it, anyone who finds the bot could publish to your site. |
| `GITHUB_TOKEN` | A **fine-grained Personal Access Token**, scoped to this one repo, with **Contents: read and write** and **Actions: read and write**. This is what fires the dispatch. Treat it as highly sensitive: it can push to your repo. |

Plain vars (in that Worker's `wrangler.toml`, not secrets):

| Variable | Value |
| --- | --- |
| `GITHUB_OWNER` | Your GitHub username or org. |
| `GITHUB_REPO` | `Soraya-Safaris-Website` |
| `GITHUB_WORKFLOW_ID` | `blog-pipeline.yml` |
| `GITHUB_DEFAULT_BRANCH` | `main` |

It also needs a **KV namespace** bound as `BLOG_REVIEW_KV`, to hold drafts awaiting approval. Create it with `npx wrangler kv namespace create BLOG_REVIEW_KV` and add the binding to `wrangler.toml`. This is a binding, not a secret.

### 6b. GitHub Actions

**Where:** GitHub → your repo → Settings → Secrets and variables → Actions → New repository secret.

| Secret | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Only used to message you if a publish **fails**. |
| `TELEGRAM_CHAT_ID` | Same. |

The workflow does **not** need a GitHub token of its own. It uses the automatic `GITHUB_TOKEN` that Actions injects, which is why `blog-pipeline.yml` declares `permissions: contents: write`.

### 6c. Drafting posts with Claude (`scripts/draft_blog.py`)

This script is **not wired into any workflow**. It is a standalone tool you run by hand. If you use it, set these in your own shell, not in GitHub or Cloudflare:

| Variable | Notes |
| --- | --- |
| `ANTHROPIC_API_KEY` | From [console.anthropic.com](https://console.anthropic.com). |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-3-5-sonnet-latest`, which is an old model — consider a current one. |
| `ANTHROPIC_MAX_TOKENS` | Optional, defaults to `4200`. |

---

## Flow 7 — Payments (Stripe) — does not exist yet

`README.md` and `DEPLOYMENT.md` list `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. **No code in this repository reads either one.** There is no checkout, no payment Worker, and no webhook handler.

Payment is currently manual: you send the client a Stripe payment link by hand. **Do not create or store these keys yet.** They would sit unused, which is a liability and not a feature.

---

## Where each secret lives, at a glance

| Secret | Cloudflare Pages | Inquiry Worker | Blog bot Worker | GitHub Actions | Your shell |
| --- | :---: | :---: | :---: | :---: | :---: |
| `PUBLIC_SITE_URL` | ● | | | | |
| `PUBLIC_INQUIRY_ENDPOINT` | ● | | | | |
| `PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN` | ● | | | | |
| `RESEND_API_KEY` | | ● | | | |
| `TURNSTILE_SECRET_KEY` | | ○ | | | |
| `TELEGRAM_BOT_TOKEN` | | ○ | ● | ● | |
| `TELEGRAM_CHAT_ID` | | ○ | | ● | |
| `TELEGRAM_SECRET_TOKEN` | | | ● | | |
| `TELEGRAM_ALLOWED_CHAT_ID` | | | ● | | |
| `GITHUB_TOKEN` (PAT) | | | ● | | |
| `ANTHROPIC_API_KEY` | | | | | ● |

● required for that flow ○ optional

---

## Corrections to the older docs

Found while auditing the source. `README.md` and `DEPLOYMENT.md` have not all been updated.

1. **Stripe keys are listed but unused.** No code reads `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`. See Flow 7.
2. **`ANTHROPIC_API_KEY` is listed as a GitHub Actions secret.** It is not read by any workflow — only by `scripts/draft_blog.py`, which you run locally. Putting it in GitHub does nothing.
3. **The blog bot Worker's secrets were never documented at all.** `TELEGRAM_SECRET_TOKEN`, `TELEGRAM_ALLOWED_CHAT_ID`, the GitHub PAT, and the `BLOG_REVIEW_KV` binding appear in no other doc, and the blog flow cannot work without them.
4. **Turnstile appears ready but is not.** The secret is documented in a way that implies the form is protected. It is not — no widget is rendered. See Flow 4.

## Rotating or revoking

If a key leaks, the fastest kill is at the source, not in the config:

- **Resend** → delete the API key in the Resend dashboard.
- **Telegram** → `/revoke` in BotFather, which invalidates the token immediately.
- **GitHub PAT** → Settings → Developer settings → revoke. **Most urgent of all**, since it can push code to your site.
- **Cloudflare** → roll the API token in your Cloudflare profile.

The Web Analytics token is public by design and does not need rotating.
