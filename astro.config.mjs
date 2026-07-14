import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

const site = (process.env.PUBLIC_SITE_URL || "https://example.com").replace(/\/+$/, "");

export default defineConfig({
  output: "static",
  site,
  trailingSlash: "never",
  integrations: [
    sitemap({
      filter: (page) => !page.endsWith("/404") && !page.endsWith("/404/")
    })
  ]
});
