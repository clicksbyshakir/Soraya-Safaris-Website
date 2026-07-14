export type JsonLd = Record<string, unknown>;

export type BreadcrumbItem = {
  name: string;
  path: string;
};

export const SITE_NAME = "{{COMPANY_NAME}}";
export const SITE_URL = (import.meta.env.PUBLIC_SITE_URL || "https://example.com").replace(/\/+$/, "");
export const SITE_DESCRIPTION =
  "Tailor-made Kenya safaris, thoughtfully planned by people who call Kenya home.";
export const TITLE_SUFFIX = `${SITE_NAME} — Kenya Safaris`;
export const DEFAULT_OG_IMAGE = "/og-default.png";
export const DEFAULT_OG_ALT = "A simple star-guided Kenya safari placeholder mark.";

export function pageTitle(page: string): string {
  return `${page} | ${TITLE_SUFFIX}`;
}

export function absoluteUrl(path: string): string {
  return new URL(path, `${SITE_URL}/`).toString();
}

export function ensureTrailingSlash(path: string): string {
  if (path === "") {
    return "/";
  }

  return path.endsWith("/") ? path : `${path}/`;
}

export function stripTrailingSlash(path: string): string {
  return path === "/" ? path : path.replace(/\/$/, "");
}

export function normalizePath(path: string): string {
  if (!path || path === "/") {
    return "/";
  }

  return stripTrailingSlash(path.startsWith("/") ? path : `/${path}`);
}

export function serializeJsonLd(value: JsonLd): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]): JsonLd | null {
  if (items.length < 2) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(normalizePath(item.path))
    }))
  };
}

export function organizationJsonLd(): JsonLd {
  const organizationId = `${SITE_URL}/#organization`;
  const agencyId = `${SITE_URL}/#travelagency`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: SITE_NAME,
        url: SITE_URL,
        logo: absoluteUrl("/icon-512.png"),
        image: absoluteUrl(DEFAULT_OG_IMAGE),
        description: SITE_DESCRIPTION,
        slogan: "Guided by home, under the stars.",
        areaServed: [
          {
            "@type": "Country",
            name: "United States"
          },
          {
            "@type": "Country",
            name: "Canada"
          }
        ]
      },
      {
        "@type": "TravelAgency",
        "@id": agencyId,
        name: SITE_NAME,
        url: SITE_URL,
        image: absoluteUrl(DEFAULT_OG_IMAGE),
        description: SITE_DESCRIPTION,
        parentOrganization: {
          "@id": organizationId
        },
        serviceArea: {
          "@type": "Country",
          name: "Kenya"
        },
        knowsAbout: [
          "Tailor-made Kenya safaris",
          "Private Kenya safari itineraries",
          "Maasai Mara",
          "Amboseli",
          "Tsavo",
          "Samburu",
          "Lake Nakuru",
          "Nairobi National Park"
        ]
      }
    ]
  };
}
