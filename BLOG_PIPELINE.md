# Automated Blog Pipeline

This file is retained as a compatibility pointer for older notes. The active publication contract is documented in `PIPELINE.md`.

The current workflow is dispatch-only:

1. The upstream Cloudflare Worker generates content and sends it to Telegram for human approval.
2. After approval, the Worker triggers `repository_dispatch` with event type `publish-blog-post`.
3. GitHub Actions validates the payload, writes `src/content/blog/{slug}.md`, runs `astro check`, runs a full build, then commits and pushes to `main`.
4. Cloudflare Pages deploys from `main`.

See `PIPELINE.md` for the payload schema, required secrets, Worker trigger example, failure behavior, and manual fallback.
