#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const workspace = process.env.GITHUB_WORKSPACE
  ? path.resolve(process.env.GITHUB_WORKSPACE)
  : process.cwd();
const failureFile = path.join(workspace, "publish_failure_reason.txt");

function readFailureReason() {
  if (!fs.existsSync(failureFile)) {
    return "The GitHub Actions run failed before a detailed failure reason was recorded.";
  }

  const reason = fs.readFileSync(failureFile, "utf8").trim();
  if (!reason) {
    return "The GitHub Actions run failed without a detailed failure reason.";
  }

  return reason.length > 3000 ? `${reason.slice(0, 3000)}...` : reason;
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to send Telegram failure alerts.`);
  }

  return value;
}

const token = requireEnv("TELEGRAM_BOT_TOKEN");
const chatId = requireEnv("TELEGRAM_CHAT_ID");
const repository = process.env.GITHUB_REPOSITORY || "unknown repository";
const runUrl = process.env.RUN_URL || "Run URL unavailable";
const slug = process.env.BLOG_SLUG || "unavailable";
const reason = readFailureReason();

const text = [
  "Blog post publication failed.",
  "",
  `Repository: ${repository}`,
  `Slug: ${slug}`,
  "",
  "Reason:",
  reason,
  "",
  `Run: ${runUrl}`
].join("\n");

const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  })
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Telegram failure alert failed with ${response.status}: ${body}`);
}

console.log("Telegram failure alert sent.");
