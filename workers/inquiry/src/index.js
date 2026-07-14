const DEFAULT_SUCCESS_MESSAGE =
  "Asante! We've got your inquiry and a real person will reply within a few hours.";

const GROUP_SIZE_OPTIONS = new Set(["1-2", "3-5", "6-10", "10+"]);
const HEARD_ABOUT_OPTIONS = new Set([
  "Search",
  "Friend or family",
  "Social media",
  "Travel advisor",
  "Returning guest",
  "Other",
]);

const rateLimitStore = new Map();

class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: corsHeaders ? 204 : 403,
        headers: corsHeaders ?? {},
      });
    }

    if (request.method !== "POST") {
      return respond(request, env, {
        status: 405,
        ok: false,
        message: "This endpoint only accepts inquiry form submissions.",
        headers: {
          Allow: "POST, OPTIONS",
          ...(corsHeaders ?? {}),
        },
      });
    }

    if (!isAllowedOrigin(request, env)) {
      return respond(request, env, {
        status: 403,
        ok: false,
        message: "This form can only be submitted from the official website.",
        headers: corsHeaders,
      });
    }

    const inquiryId = crypto.randomUUID();
    const ipAddress = getClientIp(request);

    try {
      if (isRateLimited(ipAddress, env)) {
        throw new RequestError("Please wait a little before sending another inquiry.", 429);
      }

      const fields = await parseSubmission(request);

      if (isSpam(fields)) {
        console.warn("Spam inquiry skipped", { inquiryId, reason: "honeypot" });
        return respond(request, env, {
          status: 200,
          ok: true,
          message: DEFAULT_SUCCESS_MESSAGE,
          headers: corsHeaders,
        });
      }

      validateSubmitTime(fields.formStartedAt, env);
      await validateTurnstile(fields.turnstileToken, request, env, ipAddress);

      const inquiry = validateInquiry(fields);
      inquiry.id = inquiryId;
      inquiry.receivedAt = new Date().toISOString();
      inquiry.ipAddress = ipAddress;

      const results = [];

      results.push(await settle("telegram", () => sendTelegram(inquiry, env)));
      results.push(await settle("internalEmail", () => sendInternalEmail(inquiry, env)));
      results.push(await settle("autoReply", () => sendAutoReply(inquiry, env)));

      // TODO: Append inquiry to Google Sheets after an approved auth model is chosen.
      // await appendInquiryToGoogleSheets(inquiry, env);

      const internalSucceeded = results.some(
        (result) =>
          (result.name === "telegram" || result.name === "internalEmail") && result.ok,
      );

      const failedResults = results.filter((result) => !result.ok);

      if (failedResults.length > 0) {
        console.error("Inquiry notification failures", {
          inquiryId,
          failures: failedResults.map((result) => ({
            name: result.name,
            error: result.error,
          })),
        });
      }

      if (!internalSucceeded) {
        return respond(request, env, {
          status: 502,
          ok: false,
          message:
            "We could not send your inquiry right now. Please try again or email us directly.",
          headers: corsHeaders,
        });
      }

      return respond(request, env, {
        status: 200,
        ok: true,
        message: DEFAULT_SUCCESS_MESSAGE,
        headers: corsHeaders,
      });
    } catch (error) {
      const status = error instanceof RequestError ? error.status : 500;

      console.error("Inquiry request failed", {
        inquiryId,
        status,
        error: error.message,
      });

      return respond(request, env, {
        status,
        ok: false,
        message:
          error instanceof RequestError
            ? error.message
            : "We could not send your inquiry right now. Please try again.",
        headers: corsHeaders,
      });
    }
  },
};

async function parseSubmission(request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (contentLength > 100_000) {
    throw new RequestError("The inquiry is too large. Please shorten your message.", 413);
  }

  const contentType = request.headers.get("content-type") ?? "";
  let data;

  if (contentType.includes("application/json")) {
    data = await request.json();
  } else {
    const formData = await request.formData();
    data = Object.fromEntries(formData.entries());
  }

  return {
    fullName: valueOf(data.fullName),
    email: valueOf(data.email),
    travelDates: valueOf(data.travelDates),
    groupSize: valueOf(data.groupSize),
    message: valueOf(data.message),
    heardAbout: valueOf(data.heardAbout),
    companyWebsite: valueOf(data.companyWebsite),
    formStartedAt: valueOf(data.formStartedAt),
    turnstileToken: valueOf(data["cf-turnstile-response"]),
  };
}

function validateInquiry(fields) {
  const fullName = cleanText(fields.fullName, 80);
  const email = cleanEmail(fields.email);
  const travelDates = cleanText(fields.travelDates, 120);
  const groupSize = cleanText(fields.groupSize, 12);
  const message = cleanMessage(fields.message, 2000);
  const heardAbout = cleanText(fields.heardAbout, 40);

  if (fullName.length < 2) {
    throw new RequestError("Please enter your full name.");
  }

  if (!isValidEmail(email)) {
    throw new RequestError("Please enter a valid email address.");
  }

  if (groupSize && !GROUP_SIZE_OPTIONS.has(groupSize)) {
    throw new RequestError("Please choose a valid group size.");
  }

  if (message.length < 10) {
    throw new RequestError("Please tell us a little about the trip you imagine.");
  }

  if (heardAbout && !HEARD_ABOUT_OPTIONS.has(heardAbout)) {
    throw new RequestError("Please choose a valid referral source.");
  }

  return {
    fullName,
    email,
    travelDates: travelDates || "Not specified",
    groupSize: groupSize || "Not specified",
    message,
    heardAbout: heardAbout || "Not specified",
  };
}

function isSpam(fields) {
  return cleanText(fields.companyWebsite, 200).length > 0;
}

function validateSubmitTime(rawStartedAt, env) {
  const minSeconds = numberFromEnv(env.MIN_SUBMIT_SECONDS, 3);
  const startedAt = Number(rawStartedAt);

  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    throw new RequestError("Please reload the form and try again.");
  }

  const now = Date.now();

  if (startedAt - now > 60_000) {
    throw new RequestError("Please reload the form and try again.");
  }

  if (now - startedAt < minSeconds * 1000) {
    throw new RequestError("Please take a moment before sending the form.");
  }
}

async function validateTurnstile(token, request, env, ipAddress) {
  if (!env.TURNSTILE_SECRET_KEY) {
    return;
  }

  const required = env.TURNSTILE_REQUIRED === "true";

  if (!token) {
    if (required) {
      throw new RequestError("Please complete the security check and try again.");
    }

    console.warn("Turnstile token missing; continuing because TURNSTILE_REQUIRED is not true");
    return;
  }

  if (env.DRY_RUN === "true") {
    return;
  }

  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
  });

  if (ipAddress && ipAddress !== "unknown") {
    body.set("remoteip", ipAddress);
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.success) {
    throw new RequestError("The security check failed. Please try again.");
  }

  const origin = request.headers.get("Origin");
  const allowedOrigin = normalizeOrigin(env.ALLOWED_ORIGIN);
  const tokenHostname = typeof result.hostname === "string" ? result.hostname : "";

  if (allowedOrigin && origin && tokenHostname) {
    const allowedHostname = new URL(allowedOrigin).hostname;

    if (tokenHostname !== allowedHostname) {
      throw new RequestError("The security check was not issued for this website.");
    }
  }
}

async function sendTelegram(inquiry, env) {
  if (env.DRY_RUN === "true") {
    return { dryRun: true };
  }

  requireEnv(env, "TELEGRAM_BOT_TOKEN");
  requireEnv(env, "TELEGRAM_CHAT_ID");

  const telegramMessage = [
    "<b>New safari inquiry</b>",
    "",
    `<b>Name</b>: ${escapeHtml(inquiry.fullName)}`,
    `<b>Email</b>: ${escapeHtml(inquiry.email)}`,
    `<b>Dates</b>: ${escapeHtml(inquiry.travelDates)}`,
    `<b>Group size</b>: ${escapeHtml(inquiry.groupSize)}`,
    `<b>Heard about us</b>: ${escapeHtml(inquiry.heardAbout)}`,
    `<b>Received</b>: ${escapeHtml(formatTimestamp(inquiry.receivedAt))}`,
    "",
    "<b>Dream trip</b>",
    escapeHtml(inquiry.message),
  ].join("\n");

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: truncate(telegramMessage, 3900),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Telegram API returned ${response.status}`);
  }

  return { sent: true };
}

async function sendInternalEmail(inquiry, env) {
  requireEnv(env, "INQUIRY_TO_EMAIL");

  return sendResendEmail(env, {
    from: getFromEmail(env),
    to: env.INQUIRY_TO_EMAIL,
    reply_to: inquiry.email,
    subject: `New Safari Inquiry — ${inquiry.fullName} (${inquiry.groupSize})`,
    html: internalEmailHtml(inquiry),
  });
}

async function sendAutoReply(inquiry, env) {
  return sendResendEmail(env, {
    from: getFromEmail(env),
    to: inquiry.email,
    subject: "Asante — we received your safari inquiry",
    html: autoReplyHtml(inquiry),
  });
}

async function sendResendEmail(env, payload) {
  if (env.DRY_RUN === "true") {
    return { dryRun: true };
  }

  requireEnv(env, "RESEND_API_KEY");
  requireEnv(env, "RESEND_FROM_EMAIL");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend API returned ${response.status}: ${truncate(body, 240)}`);
  }

  return { sent: true };
}

function internalEmailHtml(inquiry) {
  return `
    <div style="font-family: Inter, Arial, sans-serif; color: #182018; line-height: 1.55;">
      <h1 style="font-family: Georgia, serif; color: #0B1D34;">New safari inquiry</h1>
      <p><strong>Name:</strong> ${escapeHtml(inquiry.fullName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(inquiry.email)}</p>
      <p><strong>Approximate dates:</strong> ${escapeHtml(inquiry.travelDates)}</p>
      <p><strong>Group size:</strong> ${escapeHtml(inquiry.groupSize)}</p>
      <p><strong>Heard about us:</strong> ${escapeHtml(inquiry.heardAbout)}</p>
      <p><strong>Received:</strong> ${escapeHtml(formatTimestamp(inquiry.receivedAt))}</p>
      <hr style="border: 0; border-top: 1px solid #E8D8B5; margin: 24px 0;" />
      <h2 style="font-family: Georgia, serif; color: #2E4A3B;">Dream trip</h2>
      <p style="white-space: pre-wrap;">${escapeHtml(inquiry.message)}</p>
    </div>
  `;
}

function autoReplyHtml(inquiry) {
  return `
    <div style="font-family: Inter, Arial, sans-serif; color: #182018; line-height: 1.65;">
      <h1 style="font-family: Georgia, serif; color: #0B1D34;">Asante, ${escapeHtml(inquiry.fullName)}.</h1>
      <p>We have received your inquiry for a Kenya safari with Soraya Safaris.</p>
      <p>A founder will read your note and reply within a few hours. From there, we will ask any useful follow-up questions, shape a route around your dates and pace, and prepare a custom itinerary before any payment step.</p>
      <p>Kenya, planned by people who call it home.</p>
      <p style="color: #5E685E;">Soraya Safaris</p>
    </div>
  `;
}

async function settle(name, task) {
  try {
    await task();
    return { name, ok: true };
  } catch (error) {
    return { name, ok: false, error: error.message };
  }
}

function respond(request, env, options) {
  const headers = {
    ...options.headers,
    "Cache-Control": "no-store",
  };

  if (wantsJson(request)) {
    return Response.json(
      {
        ok: options.ok,
        message: options.message,
      },
      {
        status: options.status,
        headers,
      },
    );
  }

  return new Response(htmlResponse(options.ok, options.message, env), {
    status: options.status,
    headers: {
      ...headers,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function htmlResponse(ok, message, env) {
  const homeUrl = normalizeOrigin(env.ALLOWED_ORIGIN) || "/";
  const contactUrl = homeUrl === "/" ? "/contact" : `${homeUrl}/contact`;
  const heading = ok ? "Asante" : "We could not send that yet";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(heading)} | Soraya Safaris</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #FAF8F4;
        color: #182018;
        font-family: Inter, Arial, sans-serif;
        line-height: 1.55;
      }
      main {
        width: min(620px, calc(100% - 32px));
        border: 1px solid rgba(11, 29, 52, 0.16);
        border-radius: 8px;
        background: #FFFDF8;
        padding: 32px;
        box-shadow: 0 24px 70px rgba(11, 29, 52, 0.14);
      }
      h1 {
        margin: 0 0 14px;
        color: #0B1D34;
        font-family: Georgia, serif;
        font-size: 2.4rem;
        line-height: 1.06;
      }
      p {
        margin: 0 0 22px;
      }
      a {
        display: inline-flex;
        min-height: 44px;
        align-items: center;
        border-radius: 999px;
        background: #2E4A3B;
        color: #FFFDF8;
        padding: 0 18px;
        font-weight: 800;
        text-decoration: none;
      }
      a:focus-visible {
        outline: 3px solid rgba(200, 161, 90, 0.72);
        outline-offset: 3px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(message)}</p>
      <a href="${escapeHtml(contactUrl)}">Back to the form</a>
    </main>
  </body>
</html>`;
}

function wantsJson(request) {
  const accept = request.headers.get("Accept") ?? "";
  return accept.includes("application/json");
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowedOrigin = normalizeOrigin(env.ALLOWED_ORIGIN);

  if (!origin || !allowedOrigin || normalizeOrigin(origin) !== allowedOrigin) {
    return null;
  }

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    Vary: "Origin",
  };
}

function isAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  const allowedOrigin = normalizeOrigin(env.ALLOWED_ORIGIN);

  if (!origin) {
    return true;
  }

  return Boolean(allowedOrigin && normalizeOrigin(origin) === allowedOrigin);
}

function normalizeOrigin(origin) {
  if (!origin) {
    return "";
  }

  try {
    const url = new URL(origin);
    return url.origin;
  } catch {
    return "";
  }
}

function getClientIp(request) {
  const cfIp = request.headers.get("CF-Connecting-IP");

  if (cfIp) {
    return cfIp;
  }

  const forwardedFor = request.headers.get("X-Forwarded-For");

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return "unknown";
}

function isRateLimited(ipAddress, env) {
  const windowMs = numberFromEnv(env.RATE_LIMIT_WINDOW_SECONDS, 15 * 60) * 1000;
  const maxRequests = numberFromEnv(env.RATE_LIMIT_MAX_REQUESTS, 5);
  const now = Date.now();
  const key = ipAddress || "unknown";
  const current = rateLimitStore.get(key);

  cleanupRateLimits(now);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return false;
  }

  current.count += 1;
  rateLimitStore.set(key, current);

  return current.count > maxRequests;
}

function cleanupRateLimits(now) {
  if (rateLimitStore.size < 500) {
    return;
  }

  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

function cleanEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

function cleanText(value, maxLength) {
  return truncate(
    String(value ?? "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    maxLength,
  );
}

function cleanMessage(value, maxLength) {
  return truncate(
    String(value ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim(),
    maxLength,
  );
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function valueOf(value) {
  return typeof value === "string" ? value : "";
}

function requireEnv(env, name) {
  if (!env[name]) {
    throw new Error(`Missing env var: ${name}`);
  }
}

function getFromEmail(env) {
  requireEnv(env, "RESEND_FROM_EMAIL");
  return env.RESEND_FROM_EMAIL;
}

function numberFromEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimestamp(isoTimestamp) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(isoTimestamp));
}
