import type { ImageMetadata } from "astro";

import giraffePair from "../assets/giraffe-pair.jpg";
import giraffes from "../assets/giraffes.jpg";
import heroLeopard from "../assets/hero-leopard.jpg";
import kenyaSavannah from "../assets/kenya-savannah-hero.png";
import lionDetail from "../assets/lion-detail.jpg";
import lioness from "../assets/lioness.jpg";

export type DestinationCardData = {
  name: string;
  slug: string;
  region: string;
  image: ImageMetadata;
  imageAlt: string;
  shortDescription: string;
  bestSeason: string;
  signatureExperiences: string[];
  suggestedPairing: string;
};

export const destinations: DestinationCardData[] = [
  {
    name: "Maasai Mara",
    slug: "maasai-mara",
    region: "Southwest Kenya",
    image: lioness,
    imageAlt: "Lioness standing in green Maasai Mara brush.",
    shortDescription:
      "Open grasslands, long horizons, and the kind of morning light that slows a drive to a whisper. Migration movement is seasonal and never guaranteed, so let's build your itinerary around timing, patience, and the right guiding.",
    bestSeason: "July to October for peak demand; January to March for quieter dry-season travel.",
    signatureExperiences: ["Sunrise and sunset drives", "Big-cat tracking", "Private conservancy time"],
    suggestedPairing: "Pairs well with Amboseli, Lake Nakuru, or Samburu."
  },
  {
    name: "Amboseli",
    slug: "amboseli",
    region: "Southern Kenya",
    image: giraffes,
    imageAlt: "Giraffe against a clear blue Amboseli-style sky.",
    shortDescription:
      "Wetlands, open plains, and elephant country with Kilimanjaro beyond when the clouds allow. If scale and gentle pacing matter to you, let's build your itinerary with Amboseli as an anchor.",
    bestSeason: "June to October and January to February are typically drier, with clear mornings often strongest.",
    signatureExperiences: ["Elephant viewing", "Wetland birdlife", "Big-sky photography"],
    suggestedPairing: "Pairs well with Maasai Mara, Tsavo West, or Nairobi."
  },
  {
    name: "Tsavo East and West",
    slug: "tsavo-east-west",
    region: "Southeast Kenya",
    image: kenyaSavannah,
    imageAlt: "Wide Kenya savannah landscape with warm light and open distance.",
    shortDescription:
      "A vast southern wilderness where red earth, lava landscapes, springs, and open distance make the safari feel expansive. If you want a wilder rhythm, let's build your itinerary across both sides of Tsavo.",
    bestSeason: "June to October and January to February for drier travel; green season can be quieter and atmospheric.",
    signatureExperiences: ["Red-earth landscapes", "Mzima Springs", "Longer wilderness drives"],
    suggestedPairing: "Pairs well with Amboseli or Diani Beach."
  },
  {
    name: "Lake Nakuru",
    slug: "lake-nakuru",
    region: "Rift Valley",
    image: heroLeopard,
    imageAlt: "Leopard resting in a tree near a Rift Valley woodland setting.",
    shortDescription:
      "A compact Rift Valley landscape of lake, woodland, escarpment, birdlife, and rhino conservation. Flamingo numbers shift with lake conditions, so let's build your itinerary around the broader lake and woodland experience.",
    bestSeason: "Good year-round, with drier months often making wildlife viewing more straightforward.",
    signatureExperiences: ["Rhino-focused drives", "Rift Valley viewpoints", "Birding and woodland game drives"],
    suggestedPairing: "Pairs well between Samburu, Nairobi, and the Maasai Mara."
  },
  {
    name: "Samburu",
    slug: "samburu",
    region: "Northern Kenya",
    image: lionDetail,
    imageAlt: "Close view of a lion's eye and mane in warm northern Kenya light.",
    shortDescription:
      "North of the familiar, the land turns dry, sculpted, and river-led, with wildlife shaped by the Ewaso Nyiro. If you want contrast beyond the classic circuit, let's build your itinerary north with care.",
    bestSeason: "June to October and December to March are often strong for dry-country viewing.",
    signatureExperiences: ["Ewaso Nyiro river drives", "Northern dry-country wildlife", "Quiet camps and open landscapes"],
    suggestedPairing: "Pairs well with Lake Nakuru and Maasai Mara."
  },
  {
    name: "Diani Beach",
    slug: "diani-beach",
    region: "Kenya Coast",
    image: giraffePair,
    imageAlt: "Two giraffes in soft light, used as a placeholder for approved Diani Beach imagery.",
    shortDescription:
      "White-sand coast, slower mornings, and a softer finish after early drives and dusty roads. When safari should end with time to exhale, let's build your itinerary with the coast in the right place.",
    bestSeason: "December to March and July to October are popular; coastal weather varies by monsoon season.",
    signatureExperiences: ["Beach decompression", "Indian Ocean day trips", "Safari-and-coast pacing"],
    suggestedPairing: "Pairs well after Tsavo, Amboseli, or Maasai Mara fly-in routes."
  },
  {
    name: "Laikipia",
    slug: "laikipia",
    region: "Central Highlands",
    image: kenyaSavannah,
    imageAlt: "Open highland savannah landscape used as a placeholder for approved Laikipia imagery.",
    shortDescription:
      "Private conservancies, highland air, and a different kind of safari shaped by space, stewardship, and varied activities. If you want Kenya beyond the standard route, let's build your itinerary with Laikipia in the mix.",
    bestSeason: "June to October and January to February are often preferred, though conservancy experiences vary.",
    signatureExperiences: ["Private conservancy drives", "Walking where appropriate", "Conservation-led stays"],
    suggestedPairing: "Pairs well with Samburu, Lake Nakuru, or Maasai Mara."
  }
];
