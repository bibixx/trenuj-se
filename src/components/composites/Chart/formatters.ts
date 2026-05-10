import type { FormatterSpec } from "./types.ts";

const LOCALE = "en-US";

export type FormatterFn = (value: unknown) => string;

const NUMBER_FORMATTER = new Intl.NumberFormat(LOCALE);
const NUMBER_FORMATTER_1DP = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatNumberDefault(value: number): string {
  if (Number.isInteger(value)) {
    return NUMBER_FORMATTER.format(value);
  }
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 }).format(value);
}

function formatPace(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "—";
  }
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value - minutes * 60);
  const paddedSeconds = String(seconds).padStart(2, "0");
  return `${minutes}:${paddedSeconds}/km`;
}

function formatDuration(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "—";
  }
  const totalSeconds = Math.round(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds - hours * 3600) / 60);
  const seconds = totalSeconds - hours * 3600 - minutes * 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatHr(value: number): string {
  return `${NUMBER_FORMATTER.format(Math.round(value))} bpm`;
}

function formatDistance(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (Math.abs(value) >= 1000) {
    return `${NUMBER_FORMATTER_1DP.format(value / 1000)} km`;
  }
  return `${NUMBER_FORMATTER.format(Math.round(value))} m`;
}

function formatPercent(value: number, scale: "fraction" | "whole"): string {
  const normalized = scale === "fraction" ? value * 100 : value;
  if (Number.isInteger(normalized)) {
    return `${NUMBER_FORMATTER.format(normalized)}%`;
  }
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(normalized)}%`;
}

function applyTemplate(template: string, value: unknown): string {
  const formatted = typeof value === "number" ? formatNumberDefault(value) : String(value);
  return template.replace(/\{value\}/g, formatted);
}

export function getFormatter(spec: FormatterSpec | undefined): FormatterFn {
  if (spec === undefined || spec === "default") {
    return (value) => {
      if (typeof value === "number") {
        return formatNumberDefault(value);
      }
      return String(value ?? "");
    };
  }

  if (typeof spec === "object" && spec !== null && "format" in spec && spec.format === "percent") {
    const scale = spec.scale;
    return (value) => (typeof value === "number" ? formatPercent(value, scale) : String(value ?? ""));
  }

  if (typeof spec === "string") {
    if (spec === "pace") {
      return (value) => (typeof value === "number" ? formatPace(value) : String(value ?? ""));
    }
    if (spec === "duration") {
      return (value) => (typeof value === "number" ? formatDuration(value) : String(value ?? ""));
    }
    if (spec === "hr") {
      return (value) => (typeof value === "number" ? formatHr(value) : String(value ?? ""));
    }
    if (spec === "distance") {
      return (value) => (typeof value === "number" ? formatDistance(value) : String(value ?? ""));
    }
    if (spec === "percent") {
      return (value) => (typeof value === "number" ? formatPercent(value, "fraction") : String(value ?? ""));
    }
    if (spec.includes("{value}")) {
      return (value) => applyTemplate(spec, value);
    }
  }

  return (value) => String(value ?? "");
}
