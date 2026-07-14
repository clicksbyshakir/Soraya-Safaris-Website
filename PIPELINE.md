# Blog Publication Pipeline

This repository publishes approved blog posts through a dispatch-only GitHub Actions workflow. The upstream content-generation and Telegram approval flow lives outside the static Astro site. Once a human approves a post, the upstream Cloudflare Worker triggers this repository with a `repository_dispatch` event.

The Astro site stays fully static. The workflow only writes Markdown into `src/content/blog/`, validates the content collection, runs the site checks, commits the post, and pushes to `main`.

## Content Contract

The blog collection schema is defined in `src/content/config.ts`:

- `title`: required string
- `description`: required string
- `pubDate`: required date
- `heroImage`: optional string
- `tags`: optional array of strings
- `draft`: optional boolean, default `false`

For publication dispatches, `draft` must be omitted or `false`. A dispatch with `draft: true` is rejected because it would not publish a live post.

The filename is always derived from `metadata.title`. The workflow slugifies the title, writes `src/content/blog/{slug}.md`, and rejects the dispatch if that slug already exists.

## Dispatch Payload

Trigger event type: `publish-blog-post`.

The upstream Worker sends the approved Markdown body separately from frontmatter metadata. The workflow generates the frontmatter so the final file matches the Astro schema exactly.

```json
{
  "event_type": "publish-blog-post",
  "client_payload": {
    "metadata": {
      "title": "How Many Days Do You Need for a First Kenya Safari?",
      "description": "A practical planning guide for choosing the right length for a first Kenya safari.",
      "pubDate": "2026-07-14",
      "heroImage": "/images/blog/first-kenya-safari-length.jpg",
      "tags": ["planning", "kenya"],
      "draft": false
    },
    "markdown": "A first Kenya safari usually works best when the journey has enough space for arrival, wildlife time, and unhurried transitions.\\n\\n## Start with the pace\\n\\n..."
  }
}
```

Rules:

- `client_payload.metadata` is required.
- `client_payload.markdown` is required and must be the Markdown body only, without `---` frontmatter.
- `metadata.pubDate` must be a real `YYYY-MM-DD` calendar date.
- `metadata.tags`, when present, must be an array of strings.
- Unknown metadata fields are rejected.
- Duplicate slugs are rejected before any commit is made.

## GitHub Secrets

Required repository secrets:

- `TELEGRAM_BOT_TOKEN`: Telegram bot token used for failure alerts.
- `TELEGRAM_CHAT_ID`: Telegram chat or group ID that receives failure alerts.

The workflow uses GitHub's built-in `GITHUB_TOKEN` with the minimum workflow permission:

- `contents: write`

Do not add API keys, bot tokens, Cloudflare secrets, Resend keys, Stripe keys, or generated content credentials to repository files.

## Upstream Worker Trigger

The upstream Cloudflare Worker should call the GitHub REST API after Telegram approval:

```js
const response = await fetch(
  "https://api.github.com/repos/OWNER/REPO/dispatches",
  {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Soraya Safaris-blog-publisher",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      event_type: "publish-blog-post",
      client_payload: {
        metadata: {
          title: approvedPost.title,
          description: approvedPost.description,
          pubDate: approvedPost.pubDate,
          heroImage: approvedPost.heroImage,
          tags: approvedPost.tags,
          draft: false
        },
        markdown: approvedPost.markdown
      }
    })
  }
);

if (!response.ok) {
  throw new Error(`GitHub dispatch failed: ${response.status} ${await response.text()}`);
}
```

`GITHUB_DISPATCH_TOKEN` must be a fine-grained GitHub token scoped to this repository only. Minimum required permissions for triggering this workflow:

- Repository access: this repository only
- Contents: read/write
- Metadata: read

The publication workflow itself does not need the upstream Worker token. It uses the built-in `GITHUB_TOKEN` to commit and push the validated post.

## Failure Behavior

On any failure before the push, the workflow does not commit or publish the post.

Failure cases include:

- Missing or malformed `client_payload`
- Missing required metadata
- Invalid `pubDate`
- Markdown body that includes frontmatter
- Duplicate slug
- Astro content validation failure
- `astro check` failure
- Full build failure
- Git commit or push failure

When a failure happens, `.github/workflows/blog-pipeline.yml` runs the Telegram failure step. The message includes the repository, slug if available, failure reason, and the GitHub Actions run URL. The team should fix the generated payload or the content, then dispatch again.

## Manual Fallback

If the automation is down, publish by hand:

1. Create a Markdown file in `src/content/blog/` with a slug-safe filename, for example `src/content/blog/first-kenya-safari-length.md`.
2. Add frontmatter that matches `src/content/config.ts`.
3. Run `npm run check`.
4. Run `npm run build`.
5. Commit the file with `blog: publish {slug}`.
6. Push to `main`.

Cloudflare Pages deploys from `main`. Never push a manually added post if the local Astro check or build fails.
