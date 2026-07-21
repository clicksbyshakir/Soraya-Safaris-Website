import {
  blogPagePath,
  getPublishedPosts,
  getTags,
  getTotalPages,
  postDate,
  postPath,
  tagPath
} from "../lib/blog";
import { absoluteUrl } from "../lib/site";
import { destinationPath, getSortedDestinations } from "../lib/destinations";

export const prerender = true;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(path: string, lastmod?: Date): string {
  const lastmodXml = lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : "";
  return `
    <url>
      <loc>${escapeXml(absoluteUrl(path))}</loc>
      ${lastmodXml}
    </url>`;
}

export async function GET() {
  const posts = await getPublishedPosts();
  const tags = getTags(posts);
  const totalPages = getTotalPages(posts);
  const destinations = await getSortedDestinations();

  const staticPaths = ["/", "/our-story/", "/destinations/", "/contact/", "/blog/"];
  const destinationEntries = destinations.map((destination) =>
    urlEntry(destinationPath(destination))
  );
  const paginatedPaths = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) =>
    blogPagePath(index + 2)
  );
  const tagPaths = tags.map((tag) => tagPath(tag.label));
  const postEntries = posts.map((post) => urlEntry(postPath(post), postDate(post)));

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${staticPaths.map((path) => urlEntry(path)).join("")}
  ${destinationEntries.join("")}
  ${paginatedPaths.map((path) => urlEntry(path)).join("")}
  ${tagPaths.map((path) => urlEntry(path)).join("")}
  ${postEntries.join("")}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8"
    }
  });
}
