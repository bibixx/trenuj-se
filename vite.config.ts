import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

/**
 * Load VITE_* vars from .dev.vars (Wrangler's env file) so the frontend
 * dev server picks them up without needing a separate .env.local.
 */
function loadDevVars(): Record<string, string> {
  try {
    const content = readFileSync(".dev.vars", "utf-8");
    const env: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const match = line.match(/^(VITE_\w+)=(.*)$/);
      if (match) {
        env[match[1]!] = match[2]!;
      }
    }
    return env;
  } catch {
    return {};
  }
}

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";
  const devVars = loadDevVars();

  return {
    define: Object.fromEntries(Object.entries(devVars).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])),
    plugins: [TanStackRouterVite({ target: "react", autoCodeSplitting: true }), react()],
    build: {
      outDir: "dist",
      assetsInlineLimit(filePath) {
        // Never inline tabler icon SVGs — emit as separate files
        if (filePath.includes("@tabler/icons")) return 0;
        // Default: inline assets < 4KB
        return 4096;
      },
      rolldownOptions: {
        output: {
          assetFileNames(assetInfo) {
            if (assetInfo.name?.endsWith(".svg") && assetInfo.originalFileNames?.some((f) => f.includes("@tabler/icons"))) {
              return "assets/icons/[name]-[hash][extname]";
            }
            return "assets/[name]-[hash][extname]";
          },
        },
      },
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
      proxy: {
        "/api": "http://localhost:8788",
        "/mcp": "http://localhost:8788",
      },
    },
  };
});
