import { hashToHue } from "../../../lib/color.ts";
import type { Tone } from "./types.ts";

const ACCENT_RECIPE = "oklch(var(--workout-accent-lightness) var(--workout-accent-chroma) HUE)";
const TINT_RECIPE = "oklch(var(--workout-tint-lightness) var(--workout-tint-chroma) HUE)";

function buildOklch(hue: number, tone: Tone): string {
  const recipe = tone === "tint" ? TINT_RECIPE : ACCENT_RECIPE;
  return recipe.replace("HUE", String(hue));
}

interface ResolveColorOptions {
  hue?: number;
  tone?: Tone;
  defaultTone: Tone;
  fallbackKey: string;
}

export function resolveColor({ hue, tone, defaultTone, fallbackKey }: ResolveColorOptions): string {
  const finalHue = hue ?? hashToHue(fallbackKey);
  const finalTone = tone ?? defaultTone;
  return buildOklch(finalHue, finalTone);
}

export function resolveStroke({ hue, tone, fallbackKey }: { hue?: number; tone?: Tone; fallbackKey: string }): string {
  return resolveColor({ hue, tone, defaultTone: "accent", fallbackKey });
}

export function resolveAreaFill({ hue, tone, fallbackKey }: { hue?: number; tone?: Tone; fallbackKey: string }): string {
  return resolveColor({ hue, tone, defaultTone: "tint", fallbackKey });
}

export function resolveReferenceFill({ hue, fallbackKey, tone }: { hue?: number; fallbackKey: string; tone?: Tone }): string {
  return resolveColor({ hue, tone, defaultTone: "accent", fallbackKey });
}
