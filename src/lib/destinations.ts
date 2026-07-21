import type { ImageMetadata } from "astro";
import type { CollectionEntry } from "astro:content";
import { getCollection } from "astro:content";

import { normalizePath } from "./site";
// Neutral placeholder used only where a destination has no hero image yet
// (Nairobi). TODO: remove once real Nairobi photography lands in
// src/assets/destinations/ (see CREDITS.md).
import placeholderHero from "../assets/giraffe-pair.jpg";

export type Destination = CollectionEntry<"destinations">;

export function destinationSlug(entry: Destination): string {
  return entry.id.replace(/\.mdx?$/, "");
}

export function destinationPath(entry: Destination): string {
  return normalizePath(`/destinations/${destinationSlug(entry)}`);
}

export function destinationHeroImage(entry: Destination): ImageMetadata {
  return entry.data.heroImage ?? placeholderHero;
}

export async function getSortedDestinations(): Promise<Destination[]> {
  const destinations = await getCollection("destinations");
  return destinations.sort((a, b) => a.data.order - b.data.order);
}
