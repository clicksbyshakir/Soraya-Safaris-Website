export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Send Telegram webhooks as POST requests.", { status: 200 });
    }

    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (env.TELEGRAM_SECRET_TOKEN && secret !== env.TELEGRAM_SECRET_TOKEN) {
      return new Response("Unauthorized", { status: 401 });
    }

    const update = await request.json();
    try {
      if (update.callback_query) {
        await handleCallback(update.callback_query, env);
      } else if (update.message?.text) {
        await handleMessage(update.message, env);
      }
    } catch (error) {
      const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
      if (chatId) {
        await sendTelegram(env, chatId, `Blog bot error: ${error.message}`);
      }
      return new Response("Error", { status: 500 });
    }

    return new Response("OK", { status: 200 });
  },
};

async function handleMessage(message, env) {
  const chatId = String(message.chat.id);
  assertAllowedChat(chatId, env);
  const text = message.text.trim();

  if (text === "/start" || text === "/help") {
    await sendTelegram(
      env,
      chatId,
      "Send a Kenya safari blog idea and I will queue a draft PR. Use Approve #PR, Reject #PR, or Edit #PR followed by replacement markdown."
    );
    return;
  }

  const pendingEdit = await getPendingEdit(chatId, env);
  if (pendingEdit) {
    await replacePrBody(env, pendingEdit.prNumber, text);
    await clearPendingEdit(chatId, env);
    await sendTelegram(env, chatId, `Updated PR #${pendingEdit.prNumber}. Use Approve #${pendingEdit.prNumber} when ready.`);
    return;
  }

  const approve = text.match(/^approve\s+#?(\d+)$/i);
  if (approve) {
    await mergePullRequest(env, approve[1]);
    await sendTelegram(env, chatId, `Approved and merged PR #${approve[1]}.`);
    return;
  }

  const reject = text.match(/^reject\s+#?(\d+)$/i);
  if (reject) {
    await closePullRequest(env, reject[1]);
    await sendTelegram(env, chatId, `Rejected and closed PR #${reject[1]}.`);
    return;
  }

  const editInline = text.match(/^edit\s+#?(\d+)\s+([\s\S]+)$/i);
  if (editInline) {
    await replacePrBody(env, editInline[1], editInline[2]);
    await sendTelegram(env, chatId, `Updated PR #${editInline[1]}. Use Approve #${editInline[1]} when ready.`);
    return;
  }

  const editStart = text.match(/^edit\s+#?(\d+)$/i);
  if (editStart) {
    await setPendingEdit(chatId, editStart[1], env);
    await sendTelegram(env, chatId, `Send the replacement markdown body for PR #${editStart[1]}.`);
    return;
  }

  await dispatchWorkflow(env, text);
  await sendTelegram(env, chatId, "Draft request queued. A review PR will be opened and sent here when ready.");
}

async function handleCallback(callbackQuery, env) {
  const chatId = String(callbackQuery.message.chat.id);
  assertAllowedChat(chatId, env);
  const [action, prNumber] = callbackQuery.data.split(":");

  if (action === "approve") {
    await mergePullRequest(env, prNumber);
    await answerCallback(env, callbackQuery.id, `Merged PR #${prNumber}`);
    await sendTelegram(env, chatId, `Approved and merged PR #${prNumber}.`);
    return;
  }

  if (action === "reject") {
    await closePullRequest(env, prNumber);
    await answerCallback(env, callbackQuery.id, `Closed PR #${prNumber}`);
    await sendTelegram(env, chatId, `Rejected and closed PR #${prNumber}.`);
    return;
  }

  if (action === "edit") {
    await setPendingEdit(chatId, prNumber, env);
    await answerCallback(env, callbackQuery.id, `Editing PR #${prNumber}`);
    await sendTelegram(env, chatId, `Send the replacement markdown body for PR #${prNumber}.`);
  }
}

function assertAllowedChat(chatId, env) {
  if (env.TELEGRAM_ALLOWED_CHAT_ID && chatId !== String(env.TELEGRAM_ALLOWED_CHAT_ID)) {
    throw new Error("This Telegram chat is not allowed to control the blog bot.");
  }
}

async function dispatchWorkflow(env, topic) {
  const workflowId = env.GITHUB_WORKFLOW_ID || "blog-pipeline.yml";
  const ref = env.GITHUB_DEFAULT_BRANCH || "main";
  await github(env, `/actions/workflows/${workflowId}/dispatches`, {
    method: "POST",
    body: JSON.stringify({
      ref,
      inputs: {
        topic,
        source: "telegram",
      },
    }),
  });
}

async function mergePullRequest(env, prNumber) {
  await github(env, `/pulls/${prNumber}/merge`, {
    method: "PUT",
    body: JSON.stringify({
      merge_method: "squash",
      commit_title: `Publish approved blog draft from PR #${prNumber}`,
    }),
  });
}

async function closePullRequest(env, prNumber) {
  await github(env, `/pulls/${prNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  });
}

async function replacePrBody(env, prNumber, replacementBody) {
  const pr = await github(env, `/pulls/${prNumber}`);
  const branch = pr.head.ref;
  const files = await github(env, `/pulls/${prNumber}/files`);
  const blogFile = files.find((file) => file.filename.startsWith("content/blog/") && file.filename.endsWith(".md"));
  if (!blogFile) {
    throw new Error(`No content/blog markdown file found in PR #${prNumber}.`);
  }

  const contentData = await github(env, `/contents/${encodeURIComponentPath(blogFile.filename)}?ref=${encodeURIComponent(branch)}`);
  const current = base64ToUtf8(contentData.content);
  const next = replaceMarkdownBody(current, replacementBody);

  await github(env, `/contents/${encodeURIComponentPath(blogFile.filename)}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `Update blog draft from Telegram for PR #${prNumber}`,
      content: utf8ToBase64(next),
      branch,
      sha: contentData.sha,
    }),
  });
}

function replaceMarkdownBody(current, replacementBody) {
  if (!current.startsWith("---\n")) {
    return `${replacementBody.trim()}\n`;
  }
  const end = current.indexOf("\n---", 4);
  if (end === -1) {
    return `${replacementBody.trim()}\n`;
  }
  const frontmatter = current.slice(0, end + 4).trim();
  return `${frontmatter}\n\n${replacementBody.trim()}\n`;
}

async function github(env, path, options = {}) {
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  if (!owner || !repo || !env.GITHUB_TOKEN) {
    throw new Error("GITHUB_OWNER, GITHUB_REPO, and GITHUB_TOKEN are required.");
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "KenyaSafariTelegramBlogBot",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

async function sendTelegram(env, chatId, text) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
}

async function answerCallback(env, callbackQueryId, text) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
    }),
  });
}

async function getPendingEdit(chatId, env) {
  if (!env.BLOG_REVIEW_KV) {
    return null;
  }
  const value = await env.BLOG_REVIEW_KV.get(`edit:${chatId}`);
  return value ? JSON.parse(value) : null;
}

async function setPendingEdit(chatId, prNumber, env) {
  if (!env.BLOG_REVIEW_KV) {
    throw new Error("BLOG_REVIEW_KV binding is required for multi-message edit flow. Use: Edit #PR replacement text.");
  }
  await env.BLOG_REVIEW_KV.put(`edit:${chatId}`, JSON.stringify({ prNumber }), { expirationTtl: 60 * 60 });
}

async function clearPendingEdit(chatId, env) {
  if (env.BLOG_REVIEW_KV) {
    await env.BLOG_REVIEW_KV.delete(`edit:${chatId}`);
  }
}

function encodeURIComponentPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function base64ToUtf8(base64) {
  const clean = base64.replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

