import { getPublishedPosts, postDate, postPath } from "../lib/blog";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from "../lib/site";

export const prerender = true;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = await getPublishedPosts();
  const latestDate = posts[0] ? postDate(posts[0]) : new Date();

  const items = posts
    .map((post) => {
      const url = absoluteUrl(postPath(post));
      const publishedDate = postDate(post);
      const description = post.data.description ?? "";

      return `
        <item>
          <title>${escapeXml(post.data.title)}</title>
          <link>${escapeXml(url)}</link>
          <guid isPermaLink="true">${escapeXml(url)}</guid>
          <description>${escapeXml(description)}</description>
          <pubDate>${publishedDate.toUTCString()}</pubDate>
        </item>`;
    })
    .join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${SITE_NAME} Blog`)}</title>
    <link>${escapeXml(absoluteUrl("/blog"))}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${latestDate.toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(absoluteUrl("/rss.xml"))}" rel="self" type="application/rss+xml" />
    <docs>https://www.rssboard.org/rss-specification</docs>
    <generator>Astro static content collection</generator>
    <ttl>60</ttl>
    ${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8"
    }
  });
}
