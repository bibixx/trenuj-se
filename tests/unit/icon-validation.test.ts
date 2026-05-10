import { describe, expect, test } from "vitest";
import { validateLabelIcon } from "../../server/mcp/icon-validation.ts";

describe("validateLabelIcon", () => {
  test("accepts a known Tabler outline name", () => {
    expect(validateLabelIcon("run")).toEqual({ valid: true });
    expect(validateLabelIcon("bike")).toEqual({ valid: true });
    expect(validateLabelIcon("flame")).toEqual({ valid: true });
  });

  test("normalizes case and whitespace before lookup", () => {
    expect(validateLabelIcon("  RUN  ")).toEqual({ valid: true });
  });

  test("accepts a filled variant of an icon that has one", () => {
    expect(validateLabelIcon("flame-filled")).toEqual({ valid: true });
  });

  test("rejects a filled variant for an icon that has no filled SVG", () => {
    // 'walk' has an outline icon but no filled variant
    const result = validateLabelIcon("walk-filled");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.message).toContain("walk-filled");
      expect(result.message).toContain("search_icons");
    }
  });

  test("rejects an unknown Tabler name with a helpful message", () => {
    const result = validateLabelIcon("footprints");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.message).toContain("footprints");
      expect(result.message).toContain("search_icons");
    }
  });

  test("accepts a raw SVG string", () => {
    expect(validateLabelIcon('<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>')).toEqual({ valid: true });
  });

  test("accepts a raw SVG string with leading whitespace and case variation", () => {
    expect(validateLabelIcon("   <SVG viewBox='0 0 24 24'></SVG>")).toEqual({ valid: true });
  });

  test("accepts an emoji", () => {
    expect(validateLabelIcon("🏃")).toEqual({ valid: true });
    expect(validateLabelIcon("⛷️")).toEqual({ valid: true });
  });
});
