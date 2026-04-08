import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const ICONS_DIR = "node_modules/@tabler/icons/icons/outline";
const PUBLIC_PATH = "/icons/outline";

/**
 * Serves Tabler outline SVGs at /icons/outline/{name}.svg.
 *
 * - Dev: middleware that reads from node_modules on the fly.
 * - Build: copies SVGs into dist/icons/outline/ at writeBundle.
 */
export function tablerIconsPlugin(): Plugin {
  let outDir: string;

  return {
    name: "tabler-icons",

    configResolved(config) {
      outDir = config.build.outDir;
    },

    configureServer(server) {
      const base = resolve(ICONS_DIR);

      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(`${PUBLIC_PATH}/`)) return next();

        const file = resolve(base, req.url.slice(PUBLIC_PATH.length + 1));
        if (!file.startsWith(base) || !file.endsWith(".svg")) return next();

        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader("Cache-Control", "no-cache");
        return server.middlewares.handle(Object.assign(req, { url: `/@fs/${file}` }), res, next);
      });
    },

    writeBundle() {
      const src = resolve(ICONS_DIR);
      const dest = resolve(outDir, "icons/outline");

      if (!existsSync(src)) {
        this.warn("@tabler/icons not found — skipping icon copy");
        return;
      }

      cpSync(src, dest, { recursive: true });
    },
  };
}
