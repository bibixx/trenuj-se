export interface OgMeta {
  title: string;
  description: string;
  imageUrl: string;
  url: string;
}

/**
 * Applies HTMLRewriter to inject Open Graph and Twitter Card meta tags
 * into the SPA's index.html response for share pages.
 */
export function injectOgMeta(htmlResponse: Response, meta: OgMeta): Response {
  const tags = [
    `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
    `<meta property="og:image" content="${escapeAttr(meta.imageUrl)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeAttr(meta.url)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(meta.imageUrl)}" />`,
    `<meta name="description" content="${escapeAttr(meta.description)}" />`,
  ].join("\n    ");

  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(`${meta.title} — trenuj.se`);
      },
    })
    .on("head", {
      element(el) {
        el.append(tags, { html: true });
      },
    })
    .transform(htmlResponse);
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
