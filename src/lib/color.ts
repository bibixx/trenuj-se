import type { Label } from "./types.ts";

/**
 * Deterministically derive a hue from a string key.
 * Used as fallback when a workout label key doesn't match any defined label.
 */
export function hashToHue(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(31, hash) + key.charCodeAt(i);
    hash |= 0;
  }
  return ((hash % 360) + 360) % 360;
}

/**
 * Resolve the hue for a workout from its label, or fall back to a hash-based hue.
 */
export function resolveHue(label?: Pick<Label, "key" | "hue"> | null): number {
  if (!label) {
    return hashToHue("unlabeled");
  }
  return label.hue ?? hashToHue(label.key);
}
