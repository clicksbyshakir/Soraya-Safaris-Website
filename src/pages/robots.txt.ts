import { absoluteUrl } from "../lib/site";

export const prerender = true;

export function GET() {
  return new Response(
    [
      "User-agent: *",
      "Allow: /",
      `Sitemap: ${absoluteUrl("/sitemap-index.xml")}`,
      ""
    ].join("\n"),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    }
  );
}
