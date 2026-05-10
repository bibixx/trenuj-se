import { filledBaseNames, outlineNames } from "./icon-catalog";

const SVG_PREFIX = /^\s*<svg[\s>]/i;
const EMOJI_PREFIX = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
const FILLED_SUFFIX = "-filled";

export type IconValidationResult = { valid: true } | { valid: false; message: string };

export function validateLabelIcon(value: string): IconValidationResult {
  if (SVG_PREFIX.test(value)) return { valid: true };
  if (EMOJI_PREFIX.test(value)) return { valid: true };

  const normalized = value.trim().toLowerCase();

  if (normalized.endsWith(FILLED_SUFFIX)) {
    const base = normalized.slice(0, -FILLED_SUFFIX.length);
    if (filledBaseNames.has(base)) return { valid: true };
    return {
      valid: false,
      message: `Filled Tabler icon '${normalized}' not found — only ${filledBaseNames.size} icons have a filled variant. Use search_icons to discover valid names, or pass an emoji or raw <svg> string.`,
    };
  }

  if (outlineNames.has(normalized)) return { valid: true };
  return {
    valid: false,
    message: `Tabler icon '${normalized}' not found. Use search_icons to discover valid names, or pass an emoji or raw <svg> string.`,
  };
}
