/** Crawlable metadata for public product and guide pages. */
export function publicPageHead(path: string, title: string, description: string) {
  const url = `https://obseri.com${path}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:image", content: "https://obseri.com/obseri-social-card.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: "https://obseri.com/obseri-social-card.png" },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "WebPage",
          "@id": `${url}#webpage`,
          url,
          name: title,
          description,
          isPartOf: { "@id": "https://obseri.com/#website" },
          about: { "@id": "https://obseri.com/#software" },
          inLanguage: "en",
        },
      },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
