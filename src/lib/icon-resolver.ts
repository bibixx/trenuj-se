function svgIcon(svg: string): IconResolution & { type: "svg" } {
  return { type: "svg", svg };
}

function emojiIcon(emoji: string): IconResolution & { type: "emoji" } {
  return { type: "emoji", emoji };
}

export type IconResolution = { type: "tabler"; name: string } | { type: "svg"; svg: string } | { type: "emoji"; emoji: string } | { type: "fallback" };

const SVG_REGEX = /^\s*<svg[\s>]/i;
const EMOJI_REGEX = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;

export const FALLBACK_ICON_NAME = "activity";

/**
 * Three-tier icon resolution:
 * 1. Try to match a Tabler icon name
 * 2. If starts with <svg, treat as raw SVG
 * 3. If looks like emoji, render as text
 * 4. Fallback to generic activity icon
 */
export function resolveIcon(icon: string | null | undefined): IconResolution {
  if (!icon) {
    return { type: "fallback" };
  }

  // 1. Raw SVG
  if (SVG_REGEX.test(icon)) {
    return svgIcon(icon);
  }

  // 2. Emoji (or any other text)
  if (EMOJI_REGEX.test(icon)) {
    return emojiIcon(icon);
  }

  // Could be an unknown tabler name — try it as-is
  const normalized = icon.toLowerCase().trim();
  return { type: "tabler", name: normalized };
}
