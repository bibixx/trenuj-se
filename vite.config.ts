import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";
import { tablerIconsPlugin } from "./vite-plugin-tabler-icons";

/**
 * Load VITE_* vars from .dev.vars (Wrangler's env file) so the frontend
 * dev server picks them up without needing a separate .env.local.
 */
function loadDevVars(): { env: Record<string, string>; allEnv: Record<string, string> } {
  try {
    const content = readFileSync(".dev.vars", "utf-8");
    const env: Record<string, string> = {};
    const allEnv: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const match = line.match(/^(\w+)=(.*)$/);
      const key = match?.[1];
      const value = match?.[2];

      if (!key) {
        continue;
      }

      allEnv[key] = value!;
      if (key.startsWith("VITE_")) {
        env[key] = value!;
      }
    }
    return { env, allEnv };
  } catch {
    return { env: {}, allEnv: {} };
  }
}

/**
 * Resolve the current commit hash for display in-app. Prefers the local git
 * checkout (available locally and in Cloudflare Workers Builds), falling back
 * to a CI-provided SHA, then "unknown".
 */
function getCommitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    const ciSha = process.env.WORKERS_CI_COMMIT_SHA ?? process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA;
    return ciSha?.slice(0, 7) ?? "unknown";
  }
}

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";
  const { env: devVars, allEnv } = loadDevVars();

  // In CI / production builds, VITE_* vars come from process.env instead of .dev.vars.
  const viteEnv: Record<string, string> = { ...devVars };
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("VITE_") && value !== undefined) {
      viteEnv[key] = value;
    }
  }

  viteEnv.VITE_COMMIT_HASH = getCommitHash();

  return {
    define: Object.fromEntries(Object.entries(viteEnv).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])),
    plugins: [
      TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
      react(),
      tablerIconsPlugin(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: false,
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          // Precache the app shell (build chunks + fonts) → cache-first for hashed assets + full offline.
          globPatterns: ["**/*.{js,css,html,woff2}"],
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//, /^\/mcp/],
          runtimeCaching: [
            {
              urlPattern: /\/icons\/(outline|filled)\/.+\.svg$/,
              handler: "CacheFirst",
              options: {
                cacheName: "icons",
                expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
              },
            },
            {
              urlPattern: /\/(api|mcp)\//,
              handler: "NetworkOnly",
            },
          ],
        },
      }),
    ],
    build: {
      outDir: "dist",
    },
    css: {
      devSourcemap: true,
      modules: {
        localsConvention: "camelCase",
        generateScopedName: isDev ? "[name]__[local]___[hash:base64:5]" : undefined,
      },
    },
    server: {
      port: 5173,
      allowedHosts: allEnv.ALLOWED_HOSTS?.split(",") ?? [],
      proxy: {
        "/api": "http://localhost:8787",
        "/mcp": "http://localhost:8787",
      },
    },
  };
});
