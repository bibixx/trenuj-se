/// <reference types="vite/client" />

declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "what-input" {
  const whatInput: {
    ask: (strategy?: string) => string;
    ignoreKeys: (keys: number[]) => void;
    specificKeys: (keys: number[]) => void;
    registerOnChange: (fn: (type: string) => void, eventType?: "input" | "intent") => void;
    unRegisterOnChange: (fn: (type: string) => void) => void;
    clearStorage: () => void;
  };
  export default whatInput;
}

declare module "beautiful-mermaid" {
  export function renderMermaidSync(chart: string, options?: { bg?: string; fg?: string }): string;
  export function renderMermaidSVG(chart: string, options?: { bg?: string; fg?: string }): string;
  export function renderMermaidSVGAsync(chart: string, options?: { bg?: string; fg?: string }): Promise<string>;
  export const renderMermaid: typeof renderMermaidSVGAsync;
  export const DEFAULTS: { bg: string; fg: string };
  export const THEMES: Record<string, unknown>;
  export function fromShikiTheme(theme: unknown): unknown;
  export function parseMermaid(text: string): unknown;
  export function renderMermaidASCII(text: string, options?: unknown): string;
  export const renderMermaidAscii: typeof renderMermaidASCII;
}
