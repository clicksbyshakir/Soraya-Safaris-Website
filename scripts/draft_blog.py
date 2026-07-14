#!/usr/bin/env python3
"""Draft a Kenya safari blog post using RSS topic discovery and Anthropic."""

from __future__ import annotations

import argparse
import json
import os
import re
import textwrap
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = ROOT / "src" / "content" / "blog"
SUMMARY_PATH = ROOT / "tmp" / "blog-draft-summary.json"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

RSS_QUERIES = [
    "Kenya safari tourism",
    "Maasai Mara migration safari",
    "Kenya wildlife travel",
    "East Africa tourism trends safari",
    "Kenya eTA travel tourism",
]

INTERNAL_LINKS = [
    {"label": "Kenya destinations", "url": "/destinations/"},
    {"label": "Safari stories", "url": "/blog/"},
    {"label": "Start planning", "url": "/contact/"},
]


def slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")[:80] or "kenya-safari-update"


def parse_frontmatter(path: Path) -> dict[str, str]:
    raw = path.read_text(encoding="utf-8")
    if not raw.startswith("---\n"):
        return {}
    end = raw.find("\n---", 4)
    if end == -1:
        return {}
    metadata: dict[str, str] = {}
    for line in raw[4:end].strip().splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        metadata[key.strip()] = value.strip().strip('"')
    return metadata


def covered_terms() -> set[str]:
    terms: set[str] = set()
    for path in CONTENT_DIR.glob("*.md"):
        metadata = parse_frontmatter(path)
        terms.add(slugify(path.stem))
        for key in ("title", "topic", "slug"):
            if metadata.get(key):
                terms.add(slugify(metadata[key]))
    return terms


def google_news_rss_url(query: str) -> str:
    encoded = urllib.parse.quote(query)
    return f"https://news.google.com/rss/search?q={encoded}&hl=en-US&gl=US&ceid=US:en"


def fetch_rss_candidates() -> list[dict[str, str]]:
    candidates: list[dict[str, str]] = []
    headers = {"User-Agent": "KenyaSafariBlogBot/1.0"}

    for query in RSS_QUERIES:
        request = urllib.request.Request(google_news_rss_url(query), headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                xml_text = response.read()
        except Exception as error:
            print(f"RSS fetch failed for {query}: {error}")
            continue

        root = ET.fromstring(xml_text)
        for item in root.findall(".//item")[:8]:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            description = re.sub("<[^>]+>", "", item.findtext("description") or "").strip()
            if title:
                candidates.append(
                    {
                        "topic": title,
                        "query": query,
                        "link": link,
                        "description": description,
                    }
                )

    return candidates


def select_topic(explicit_topic: str | None) -> dict[str, str]:
    if explicit_topic:
        return {"topic": explicit_topic, "query": "manual", "link": "", "description": explicit_topic}

    covered = covered_terms()
    for candidate in fetch_rss_candidates():
        normalized = slugify(candidate["topic"])
        if normalized and normalized not in covered:
            return candidate

    fallback = "Best time to plan a private Kenya safari this season"
    return {"topic": fallback, "query": "fallback", "link": "", "description": fallback}


def build_prompt(candidate: dict[str, str], brand_voice: str) -> str:
    internal_links = "\n".join(f"- {link['label']}: {link['url']}" for link in INTERNAL_LINKS)
    return textwrap.dedent(
        f"""
        Draft a blog post for a Kenya-based private safari company.

        Topic or brief:
        {candidate["topic"]}

        Source context:
        - Discovery query: {candidate.get("query", "")}
        - Source URL, if any: {candidate.get("link", "")}
        - Source description, if any: {candidate.get("description", "")}

        Brand voice notes:
        {brand_voice}

        Internal link options:
        {internal_links}

        Requirements:
        - Stay tightly inside Kenya travel, safari planning, wildlife seasons, parks, conservation-aware travel, or East Africa tourism context.
        - Do not write generic travel content unrelated to the business.
        - Write a full, useful post in a warm, expert, practical voice.
        - H2 sections must open with a direct answer in the first sentence of that section.
        - Include at least one clearly marked local insight placeholder that the owner can replace during review.
        - Suggest internal links where relevant.
        - Suggest alt text for any image ideas, but do not invent image filenames.
        - Avoid hard claims about live fees, entry rules, or licences unless framed as "verify before travel".
        - The PR review is the approval gate, so the post may be publish-ready in tone but must leave room for owner edits.

        Return ONLY valid JSON with these keys:
        {{
          "title": "human-readable post title",
          "slug": "url-safe-slug",
          "title_tag": "SEO title tag under 60 characters if possible",
          "meta_description": "SEO meta description under 160 characters if possible",
          "excerpt": "one-sentence article summary",
          "tags": ["one", "to", "four", "short", "topic", "tags"],
          "body_markdown": "full markdown article body, starting with an intro paragraph and using H2 headings",
          "internal_links": [{{"label": "label", "url": "relative-url"}}],
          "image_suggestions": [{{"description": "image idea", "alt": "alt text"}}]
        }}
        """
    ).strip()


def call_anthropic(prompt: str) -> dict[str, Any]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise SystemExit("ANTHROPIC_API_KEY is required to draft a post.")

    payload = {
        "model": os.environ.get("ANTHROPIC_MODEL") or "claude-3-5-sonnet-latest",
        "max_tokens": int(os.environ.get("ANTHROPIC_MAX_TOKENS", "4200")),
        "temperature": 0.45,
        "system": "You are an expert Kenya safari content strategist and careful travel writer.",
        "messages": [{"role": "user", "content": prompt}],
    }
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        ANTHROPIC_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=120) as response:
        result = json.loads(response.read().decode("utf-8"))

    text = "\n".join(
        block.get("text", "")
        for block in result.get("content", [])
        if block.get("type") == "text"
    ).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as error:
        raise SystemExit(f"Claude response was not valid JSON: {error}\n{text[:1000]}")


def yaml_quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").strip() + '"'


def render_markdown(draft: dict[str, Any], candidate: dict[str, str]) -> str:
    today = date.today().isoformat()
    title = str(draft.get("title") or candidate["topic"]).strip()
    description = str(
        draft.get("meta_description") or draft.get("description") or draft.get("excerpt") or candidate["description"]
    ).strip() or f"Planning notes for {title}."
    body = str(draft.get("body_markdown") or "").strip()

    if "LOCAL INSIGHT" not in body.upper():
        body += "\n\n## Local insight to add before publishing\n\n[LOCAL INSIGHT PLACEHOLDER: Add a specific note from your guides, recent trips, or guest questions before merging this PR.]"

    internal_links = draft.get("internal_links") or []
    if internal_links:
        body += "\n\n## Suggested internal links\n\n"
        for link in internal_links:
            label = link.get("label", "Internal link")
            url = link.get("url", "")
            body += f"- [{label}]({url})\n"

    image_suggestions = draft.get("image_suggestions") or []
    if image_suggestions:
        body += "\n\n## Image suggestions and alt text\n\n"
        for image in image_suggestions:
            description = image.get("description", "Image idea")
            alt = image.get("alt", "")
            body += f"- {description}. Alt text: {alt}\n"

    raw_tags = draft.get("tags") or []
    tags = [str(tag).strip() for tag in raw_tags if str(tag).strip()][:6]

    frontmatter_lines = [
        f"title: {yaml_quote(title)}",
        f"description: {yaml_quote(description)}",
        f"pubDate: {today}",
    ]
    if tags:
        frontmatter_lines.append("tags:")
        frontmatter_lines.extend(f"  - {yaml_quote(tag)}" for tag in tags)
    frontmatter_lines.append("draft: false")
    yaml = "\n".join(frontmatter_lines)
    return f"---\n{yaml}\n---\n\n{body}\n"


def write_summary(markdown_path: Path, draft: dict[str, Any], candidate: dict[str, str]) -> None:
    SUMMARY_PATH.parent.mkdir(exist_ok=True)
    SUMMARY_PATH.write_text(
        json.dumps(
            {
                "title": draft.get("title"),
                "slug": markdown_path.stem,
                "path": str(markdown_path.relative_to(ROOT)),
                "description": draft.get("meta_description") or draft.get("description") or draft.get("excerpt"),
                "excerpt": draft.get("excerpt"),
                "tags": draft.get("tags"),
                "topic": candidate.get("topic"),
                "source_url": candidate.get("link"),
                "body_markdown": draft.get("body_markdown"),
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--topic", default="", help="Optional user-provided topic or brief.")
    parser.add_argument("--source", default="daily", help="Source label, e.g. daily or telegram.")
    parser.add_argument(
        "--brand-voice-file",
        default="src/content/brand-voice.md",
        help="Optional text file with brand voice notes.",
    )
    args = parser.parse_args()

    CONTENT_DIR.mkdir(parents=True, exist_ok=True)
    brand_voice_path = ROOT / args.brand_voice_file
    brand_voice = (
        brand_voice_path.read_text(encoding="utf-8")
        if brand_voice_path.exists()
        else "Warm, knowledgeable, locally grounded, practical, honest about wildlife and changing travel rules."
    )

    candidate = select_topic(args.topic.strip() or None)
    prompt = build_prompt(candidate, brand_voice)
    draft = call_anthropic(prompt)
    slug = slugify(str(draft.get("slug") or draft.get("title") or candidate["topic"]))
    markdown_path = CONTENT_DIR / f"{date.today().isoformat()}-{slug}.md"
    if markdown_path.exists():
        raise SystemExit(f"Draft already exists: {markdown_path}")

    markdown_path.write_text(render_markdown(draft, candidate), encoding="utf-8")
    write_summary(markdown_path, draft, candidate)
    print(f"Wrote {markdown_path.relative_to(ROOT)} from {args.source} topic: {candidate['topic']}")


if __name__ == "__main__":
    main()
