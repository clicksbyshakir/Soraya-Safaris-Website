import { existsSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import type { CollectionEntry } from "astro:content";
import { getCollection } from "astro:content";

import { DEFAULT_OG_IMAGE, normalizePath } from "./site";

export type BlogPost = CollectionEntry<"blog">;
export type BlogTag = {
  label: string;
  slug: string;
  count: number;
};

export const POSTS_PER_PAGE = 10;
const BLOG_CONTENT_DIR = join(process.cwd(), "src", "content", "blog");

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});

export function formatPostDate(date: Date): string {
  return dateFormatter.format(date);
}

export function postDate(post: BlogPost): Date {
  return post.data.pubDate;
}

export function postSlug(id: string): string {
  const withoutExtension = id.replace(/\.(md|mdx)$/, "").replace(/\/index$/, "");
  return withoutExtension.split("/").pop() ?? withoutExtension;
}

export function postPath(post: BlogPost): string {
  return normalizePath(`/blog/${postSlug(post.id)}`);
}

export function postHeroImage(post: BlogPost): string {
  const image =
    post.data.heroImage ??
    ("image" in post.data && typeof post.data.image === "string" ? post.data.image : undefined);

  if (!image) {
    return DEFAULT_OG_IMAGE;
  }

  if (/^https?:\/\//.test(image)) {
    return image;
  }

  if (image.startsWith("/") && existsSync(join(process.cwd(), "public", image.replace(/^\/+/, "")))) {
    const optimizedImage = image.replace(/^\/assets\//, "/assets/optimized/");

    if (
      optimizedImage !== image &&
      existsSync(join(process.cwd(), "public", optimizedImage.replace(/^\/+/, "")))
    ) {
      return optimizedImage;
    }

    return image;
  }

  return DEFAULT_OG_IMAGE;
}

export function blogPagePath(page: number): string {
  return page <= 1 ? "/blog" : normalizePath(`/blog/page/${page}`);
}

export function tagSlug(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function tagPath(tag: string): string {
  return normalizePath(`/blog/tag/${tagSlug(tag)}`);
}

export function isPublishedPost(post: BlogPost, now = new Date()): boolean {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  return !post.data.draft && postDate(post).valueOf() <= endOfToday.valueOf();
}

function hasMarkdownFiles(directory: string): boolean {
  if (!existsSync(directory)) {
    return false;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory() && hasMarkdownFiles(entryPath)) {
      return true;
    }

    if (entry.isFile() && [".md", ".mdx"].includes(extname(entry.name).toLowerCase())) {
      return true;
    }
  }

  return false;
}

export async function getPublishedPosts(): Promise<BlogPost[]> {
  if (!hasMarkdownFiles(BLOG_CONTENT_DIR)) {
    return [];
  }

  const posts = await getCollection("blog");

  return posts
    .filter((post) => isPublishedPost(post))
    .sort((a, b) => postDate(b).valueOf() - postDate(a).valueOf());
}

export function getTotalPages(posts: BlogPost[]): number {
  return Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
}

export function getPagePosts(posts: BlogPost[], page: number): BlogPost[] {
  const start = (page - 1) * POSTS_PER_PAGE;
  return posts.slice(start, start + POSTS_PER_PAGE);
}

export function getTags(posts: BlogPost[]): BlogTag[] {
  const tags = new Map<string, BlogTag>();

  for (const post of posts) {
    for (const tag of post.data.tags ?? []) {
      const slug = tagSlug(tag);
      if (!slug) {
        continue;
      }

      const existing = tags.get(slug);
      if (existing) {
        existing.count += 1;
      } else {
        tags.set(slug, { label: tag, slug, count: 1 });
      }
    }
  }

  return Array.from(tags.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function postsForTag(posts: BlogPost[], slug: string): BlogPost[] {
  return posts.filter((post) => (post.data.tags ?? []).some((tag) => tagSlug(tag) === slug));
}
