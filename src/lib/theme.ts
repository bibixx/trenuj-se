import { useCallback, useSyncExternalStore } from "react";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "theme";
const DEFAULT_PREFERENCE: ThemePreference = "system";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function getStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "dark" || raw === "light" || raw === "system") return raw;
  } catch {
    // SSR or storage unavailable
  }
  return DEFAULT_PREFERENCE;
}

function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? getSystemTheme() : preference;
}

let currentPreference: ThemePreference = DEFAULT_PREFERENCE;
let currentResolved: ResolvedTheme = "dark";
let initialized = false;
const listeners = new Set<() => void>();

const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: "#141419",
  light: "#f3f2f6",
};

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
}

function notify() {
  for (const listener of listeners) listener();
}

export function initTheme() {
  if (initialized) return;
  initialized = true;

  currentPreference = getStoredPreference();
  currentResolved = resolve(currentPreference);
  applyTheme(currentResolved);

  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (currentPreference !== "system") return;
    currentResolved = getSystemTheme();
    applyTheme(currentResolved);
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ThemePreference {
  return currentPreference;
}

function getResolvedSnapshot(): ResolvedTheme {
  return currentResolved;
}

function setTheme(preference: ThemePreference) {
  if (preference === currentPreference) return;
  currentPreference = preference;
  currentResolved = resolve(preference);
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // storage full or unavailable
  }
  applyTheme(currentResolved);
  notify();
}

export function useTheme() {
  const preference = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_PREFERENCE);
  const resolved = useSyncExternalStore(subscribe, getResolvedSnapshot, () => "dark" as ResolvedTheme);
  return [preference, resolved, useCallback((t: ThemePreference) => setTheme(t), [])] as const;
}
