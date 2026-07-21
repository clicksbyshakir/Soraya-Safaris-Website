import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    heroImage: z.string().optional(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().default(false)
  })
});

const destinations = defineCollection({
  loader: glob({ base: "./src/content/destinations", pattern: "**/*.md" }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      region: z.string(),
      order: z.number(),
      // Optional so Nairobi, which has no photograph yet, still validates.
      heroImage: image().optional(),
      heroImageAlt: z.string(),
      cardSummary: z.string(),
      bestSeason: z.string(),
      signatureExperiences: z.array(z.string()),
      suggestedPairing: z.string(),
      gallery: z.array(z.object({ image: image(), alt: z.string() })).default([])
    })
});

export const collections = { blog, destinations };
