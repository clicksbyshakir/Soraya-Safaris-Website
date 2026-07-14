#!/usr/bin/env python3
"""Build static blog HTML from content/blog/*.md.

This intentionally uses only the Python standard library so GitHub Actions can
run it without installing a site framework.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = ROOT / "content" / "blog"
OUTPUT_DIR = ROOT / "blog"


@dataclass
class Post:
    source_path: Path
    slug: str
    title: str
    title_tag: str
    meta_description: str
    post_date: str
    excerpt: str
    body_markdown: str
    body_html: str


def parse_frontmatter(path: Path) -> tuple[dict[str, str], str]:
    raw = path.read_text(encoding="utf-8")
    if not raw.startswith("---\n"):
        return {}, raw

    end = raw.find("\n---", 4)
    if end == -1:
        return {}, raw

    frontmatter_text = raw[4:end].strip()
    body = raw[end + 4 :].lstrip()
    metadata: dict[str, str] = {}

    for line in frontmatter_text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        metadata[key.strip()] = value.strip().strip('"')

    return metadata, body


def inline_markdown(text: str) -> str:
    escaped = html.escape(text)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", escaped)
    escaped = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        lambda match: f'<a href="{html.escape(match.group(2), quote=True)}">{match.group(1)}</a>',
        escaped,
    )
    return escaped


def markdown_to_html(markdown: str) -> str:
    lines = markdown.splitlines()
    blocks: list[str] = []
    paragraph: list[str] = []
    list_items: list[str] = []

    def flush_paragraph() -> None:
        if paragraph:
            blocks.append(f"<p>{inline_markdown(' '.join(paragraph).strip())}</p>")
            paragraph.clear()

    def flush_list() -> None:
        if list_items:
            items = "".join(f"<li>{inline_markdown(item)}</li>" for item in list_items)
            blocks.append(f"<ul>{items}</ul>")
            list_items.clear()

    for line in lines:
        stripped = line.strip()
        if not stripped:
            flush_paragraph()
            flush_list()
            continue

        if stripped.startswith("### "):
            flush_paragraph()
            flush_list()
            blocks.append(f"<h3>{inline_markdown(stripped[4:])}</h3>")
            continue

        if stripped.startswith("## "):
            flush_paragraph()
            flush_list()
            blocks.append(f"<h2>{inline_markdown(stripped[3:])}</h2>")
            continue

        if stripped.startswith("# "):
            flush_paragraph()
            flush_list()
            blocks.append(f"<h1>{inline_markdown(stripped[2:])}</h1>")
            continue

        if stripped.startswith(("- ", "* ")):
            flush_paragraph()
            list_items.append(stripped[2:].strip())
            continue

        flush_list()
        paragraph.append(stripped)

    flush_paragraph()
    flush_list()
    return "\n".join(blocks)


def load_posts() -> list[Post]:
    posts: list[Post] = []
    for path in sorted(CONTENT_DIR.glob("*.md")):
        metadata, body = parse_frontmatter(path)
        if metadata.get("status", "").lower() == "rejected":
            continue

        slug = metadata.get("slug") or path.stem
        title = metadata.get("title") or slug.replace("-", " ").title()
        excerpt = metadata.get("excerpt") or metadata.get("meta_description") or ""
        posts.append(
            Post(
                source_path=path,
                slug=slug,
                title=title,
                title_tag=metadata.get("title_tag") or title,
                meta_description=metadata.get("meta_description") or excerpt,
                post_date=metadata.get("date") or date.today().isoformat(),
                excerpt=excerpt,
                body_markdown=body,
                body_html=markdown_to_html(body),
            )
        )

    posts.sort(key=lambda post: post.post_date, reverse=True)
    return posts


def render_nav(prefix: str, current: str = "") -> str:
    def link(label: str, href: str, key: str) -> str:
        current_attr = ' aria-current="page"' if key == current else ""
        return f'<a href="{prefix}{href}"{current_attr}>{label}</a>'

    return f"""
    <header class="site-header" data-header>
      <nav class="nav wrapper" aria-label="Primary navigation">
        <a class="brand" href="{prefix}index.html" aria-label="Kenya Safari Co. home">
          <span class="brand-mark">KS</span>
          <span>Kenya Safari Co.</span>
        </a>
        <button class="nav-toggle" type="button" aria-controls="primary-navigation" aria-expanded="false">
          <span class="nav-toggle-line"></span>
          <span class="nav-toggle-line"></span>
          <span class="nav-toggle-line"></span>
          <span class="sr-only">Open navigation</span>
        </button>
        <div class="nav-links" id="primary-navigation" data-nav-links>
          {link("Safaris", "safaris.html", "safaris")}
          {link("Destinations", "destinations.html", "destinations")}
          {link("Planning", "planning.html", "planning")}
          {link("Blog", "blog/index.html", "blog")}
          <a class="nav-cta" href="{prefix}index.html#enquire">Start planning</a>
        </div>
      </nav>
    </header>
"""


def render_footer(prefix: str) -> str:
    return f"""
    <footer class="site-footer">
      <div class="wrapper footer-layout">
        <div>
          <a class="brand footer-brand" href="{prefix}index.html">
            <span class="brand-mark">KS</span>
            <span>Kenya Safari Co.</span>
          </a>
          <p>Private Kenya safaris shaped around wildlife, comfort, timing, and trust.</p>
        </div>
        <div class="footer-links" aria-label="Footer links">
          <a href="{prefix}safaris.html">Safaris</a>
          <a href="{prefix}destinations.html">Destinations</a>
          <a href="{prefix}planning.html">Planning</a>
          <a href="{prefix}blog/index.html">Blog</a>
          <a href="{prefix}index.html#enquire">Contact</a>
        </div>
        <p class="footer-note">
          Replace placeholder contact details, licence details, review links, and payment terms before publishing.
        </p>
      </div>
    </footer>
"""


def page_shell(title: str, description: str, body: str, prefix: str = "../") -> str:
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="{html.escape(description, quote=True)}">
    <title>{html.escape(title)}</title>
    <link rel="icon" href="{prefix}assets/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="{prefix}styles.css">
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    {render_nav(prefix, "blog")}
    {body}
    {render_footer(prefix)}
    <script src="{prefix}script.js"></script>
  </body>
</html>
"""


def render_index(posts: Iterable[Post]) -> str:
    post_cards = []
    for post in posts:
        post_cards.append(
            f"""
          <article class="blog-card">
            <p class="card-kicker">{html.escape(post.post_date)}</p>
            <h2><a href="{html.escape(post.slug)}.html">{html.escape(post.title)}</a></h2>
            <p>{html.escape(post.excerpt)}</p>
            <a class="text-link" href="{html.escape(post.slug)}.html">Read article</a>
          </article>
"""
        )

    if not post_cards:
        post_cards.append(
            """
          <article class="blog-card empty-blog">
            <p class="card-kicker">Coming soon</p>
            <h2>Safari field notes are being prepared.</h2>
            <p>New Kenya safari planning articles will appear here after review and approval.</p>
          </article>
"""
        )

    body = f"""
    <main id="main">
      <section class="page-hero compact-hero">
        <img src="../assets/giraffes.jpg" alt="Giraffe against a bright blue sky.">
        <div class="page-hero-overlay" aria-hidden="true"></div>
        <div class="wrapper page-hero-copy">
          <p class="eyebrow">Safari journal</p>
          <h1>Kenya safari notes, season updates, and travel advice.</h1>
          <p>Useful planning articles written for guests considering a private Kenya safari.</p>
        </div>
      </section>

      <section class="section">
        <div class="wrapper blog-grid">
          {"".join(post_cards)}
        </div>
      </section>
    </main>
"""
    return page_shell(
        "Safari Journal | Kenya Safari Co.",
        "Kenya safari articles, travel planning notes, wildlife season updates, and destination advice.",
        body,
    )


def render_post(post: Post) -> str:
    body = f"""
    <main id="main">
      <article class="blog-post wrapper">
        <header class="blog-post-header">
          <p class="eyebrow">{html.escape(post.post_date)}</p>
          <h1>{html.escape(post.title)}</h1>
          <p>{html.escape(post.excerpt)}</p>
        </header>
        <div class="blog-post-body">
          {post.body_html}
        </div>
      </article>
    </main>
"""
    return page_shell(post.title_tag, post.meta_description, body)


def main() -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    posts = load_posts()
    (OUTPUT_DIR / "index.html").write_text(render_index(posts), encoding="utf-8")
    for post in posts:
        (OUTPUT_DIR / f"{post.slug}.html").write_text(render_post(post), encoding="utf-8")
    print(f"Built {len(posts)} blog post(s).")


if __name__ == "__main__":
    main()

