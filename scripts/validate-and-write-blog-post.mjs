#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const workspace = process.env.GITHUB_WORKSPACE
  ? path.resolve(process.env.GITHUB_WORKSPACE)
  : process.cwd();
const eventPath = process.env.GITHUB_EVENT_PATH;
const outputDir = path.resolve(workspace, process.env.BLOG_OUTPUT_DIR || "src/content/blog");
const failureFile = path.join(workspace, "publish_failure_reason.txt");
const allowedMetadataFields = new Set([
  "title",
  "description",
  "pubDate",
  "heroImage",
  "tags",
  "draft"
]);

function writeFailure(message) {
  fs.writeFileSync(failureFile, `${message}\n`, "utf8");

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Blog publish validation failed\n\n${message}\n`,
      "utf8"
    );
  }
}

function fail(message) {
  writeFailure(message);
  throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readEvent() {
  if (!eventPath) {
    fail("GITHUB_EVENT_PATH is not set.");
  }

  try {
    return JSON.parse(fs.readFileSync(eventPath, "utf8"));
  } catch (error) {
    fail(`Unable to read repository_dispatch event payload: ${error.message}`);
  }
}

function requiredString(metadata, fieldName) {
  const value = metadata[fieldName];

  if (typeof value !== "string") {
    fail(`metadata.${fieldName} must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    fail(`metadata.${fieldName} must not be empty.`);
  }

  if (/[\r\n]/.test(value)) {
    fail(`metadata.${fieldName} must be a single line.`);
  }

  return trimmed;
}

function optionalString(metadata, fieldName) {
  const value = metadata[fieldName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    fail(`metadata.${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    fail(`metadata.${fieldName} must not be empty when provided.`);
  }

  if (/[\r\n]/.test(value)) {
    fail(`metadata.${fieldName} must be a single line.`);
  }

  return trimmed;
}

function validDateString(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const [, year, month, day] = match;
  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day)
  );
}

function slugify(title) {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
}

function yamlString(value) {
  return JSON.stringify(value);
}

function collectMarkdownFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(entryPath));
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (entry.isFile() && (extension === ".md" || extension === ".mdx")) {
      files.push(entryPath);
    }
  }

  return files;
}

function assertNoDuplicateSlug(slug) {
  const duplicate = collectMarkdownFiles(outputDir).find((filePath) => {
    const extension = path.extname(filePath);
    const relativeWithoutExtension = path
      .relative(outputDir, filePath)
      .slice(0, -extension.length)
      .split(path.sep)
      .join("/");

    return relativeWithoutExtension === slug || path.basename(relativeWithoutExtension) === slug;
  });

  if (duplicate) {
    fail(`Duplicate blog slug "${slug}" already exists at ${path.relative(workspace, duplicate)}.`);
  }
}

function validatePayload(event) {
  if (event.action && event.action !== "publish-blog-post") {
    fail(`Unsupported repository_dispatch event type "${event.action}".`);
  }

  const payload = event.client_payload;
  if (!isPlainObject(payload)) {
    fail("client_payload must be an object.");
  }

  if (!isPlainObject(payload.metadata)) {
    fail("client_payload.metadata must be an object.");
  }

  const unknownFields = Object.keys(payload.metadata).filter(
    (fieldName) => !allowedMetadataFields.has(fieldName)
  );
  if (unknownFields.length > 0) {
    fail(`Unsupported metadata field(s): ${unknownFields.join(", ")}.`);
  }

  if (typeof payload.markdown !== "string") {
    fail("client_payload.markdown must be a Markdown body string.");
  }

  const markdown = payload.markdown.trimEnd();
  if (!markdown.trim()) {
    fail("client_payload.markdown must not be empty.");
  }

  if (/^\s*---(?:\r?\n|$)/.test(markdown)) {
    fail("client_payload.markdown must contain the body only; put frontmatter in metadata.");
  }

  const title = requiredString(payload.metadata, "title");
  const description = requiredString(payload.metadata, "description");
  const pubDate = requiredString(payload.metadata, "pubDate");
  const heroImage = optionalString(payload.metadata, "heroImage");

  if (!validDateString(pubDate)) {
    fail("metadata.pubDate must be a valid YYYY-MM-DD calendar date.");
  }

  const slug = slugify(title);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fail("metadata.title must produce a slug-safe filename containing letters or numbers.");
  }

  let tags;
  if (payload.metadata.tags !== undefined) {
    if (!Array.isArray(payload.metadata.tags)) {
      fail("metadata.tags must be an array of strings when provided.");
    }

    tags = payload.metadata.tags.map((tag, index) => {
      if (typeof tag !== "string") {
        fail(`metadata.tags[${index}] must be a string.`);
      }

      const trimmed = tag.trim();
      if (!trimmed) {
        fail(`metadata.tags[${index}] must not be empty.`);
      }

      if (/[\r\n]/.test(tag)) {
        fail(`metadata.tags[${index}] must be a single line.`);
      }

      return trimmed;
    });
  }

  const draft = payload.metadata.draft ?? false;
  if (typeof draft !== "boolean") {
    fail("metadata.draft must be a boolean when provided.");
  }

  if (draft) {
    fail('metadata.draft must be omitted or false for a publish dispatch.');
  }

  return {
    slug,
    markdown,
    frontmatter: {
      title,
      description,
      pubDate,
      heroImage,
      tags,
      draft: false
    }
  };
}

function buildMarkdownFile(frontmatter, markdown) {
  const lines = [
    "---",
    `title: ${yamlString(frontmatter.title)}`,
    `description: ${yamlString(frontmatter.description)}`,
    `pubDate: ${frontmatter.pubDate}`
  ];

  if (frontmatter.heroImage) {
    lines.push(`heroImage: ${yamlString(frontmatter.heroImage)}`);
  }

  if (frontmatter.tags && frontmatter.tags.length > 0) {
    lines.push("tags:");
    for (const tag of frontmatter.tags) {
      lines.push(`  - ${yamlString(tag)}`);
    }
  }

  lines.push("draft: false", "---", "", markdown, "");

  return lines.join("\n");
}

function writeOutput(slug, frontmatter, markdown) {
  assertNoDuplicateSlug(slug);
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${slug}.md`);
  const relativeOutputPath = path.relative(workspace, outputPath);
  fs.writeFileSync(outputPath, buildMarkdownFile(frontmatter, markdown), "utf8");

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `slug=${slug}\npath=${relativeOutputPath}\n`, "utf8");
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Blog post staged\n\n- Slug: \`${slug}\`\n- Path: \`${relativeOutputPath}\`\n`,
      "utf8"
    );
  }

  console.log(`Staged blog post at ${relativeOutputPath}`);
}

try {
  const event = readEvent();
  const { slug, markdown, frontmatter } = validatePayload(event);
  writeOutput(slug, frontmatter, markdown);
} catch (error) {
  if (!fs.existsSync(failureFile)) {
    writeFailure(error.message);
  }

  console.error(error.message);
  process.exit(1);
}
