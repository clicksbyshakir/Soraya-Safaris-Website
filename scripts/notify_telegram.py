#!/usr/bin/env python3
"""Send a drafted blog post to Telegram for phone review."""

from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SUMMARY_PATH = ROOT / "tmp" / "blog-draft-summary.json"


def send_message(token: str, chat_id: str, text: str, reply_markup: dict | None = None) -> None:
    payload: dict[str, object] = {
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": True,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup

    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        response.read()


def chunks(text: str, size: int = 3500) -> list[str]:
    parts: list[str] = []
    while text:
        if len(text) <= size:
            parts.append(text)
            break
        cut = text.rfind("\n", 0, size)
        if cut < size // 2:
            cut = size
        parts.append(text[:cut].strip())
        text = text[cut:].strip()
    return parts


def main() -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    pr_number = os.environ.get("PR_NUMBER")
    pr_url = os.environ.get("PR_URL", "")

    if not token or not chat_id:
        print("Skipping Telegram notification: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set.")
        return
    if not pr_number:
        print("Skipping Telegram notification: PR_NUMBER not set.")
        return
    if not SUMMARY_PATH.exists():
        print("Skipping Telegram notification: draft summary not found.")
        return

    summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
    body = summary.get("body_markdown") or ""
    message = "\n\n".join(
        [
            f"New safari blog draft: {summary.get('title', 'Untitled')}",
            f"Meta: {summary.get('meta_description', '')}",
            f"Topic: {summary.get('topic', '')}",
            f"PR: {pr_url}",
            body,
        ]
    ).strip()

    parts = chunks(message)
    for part in parts[:-1]:
        send_message(token, chat_id, part)

    keyboard = {
        "inline_keyboard": [
            [
                {"text": "Approve", "callback_data": f"approve:{pr_number}"},
                {"text": "Edit", "callback_data": f"edit:{pr_number}"},
                {"text": "Reject", "callback_data": f"reject:{pr_number}"},
            ]
        ]
    }
    send_message(token, chat_id, parts[-1], keyboard)
    print("Telegram notification sent.")


if __name__ == "__main__":
    main()

