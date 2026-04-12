import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const ICON_STYLES = ["outline", "filled"] as const;
const ICONS_BASE = "node_modules/@tabler/icons/icons";

/**
 * Serves Tabler SVGs at /icons/{outline,filled}/{name}.svg.
 *
 * - Dev: middleware that reads from node_modules on the fly.
 * - Build: copies SVGs into dist/icons/{style}/ at writeBundle.
 */
export function tablerIconsPlugin(): Plugin {
  let outDir: string;

  return {
    name: "tabler-icons",

    configResolved(config) {
      outDir = config.build.outDir;
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/icons/")) return next();

        for (const style of ICON_STYLES) {
          const prefix = `/icons/${style}/`;
          if (!req.url.startsWith(prefix)) continue;

          const base = resolve(ICONS_BASE, style);
          const file = resolve(base, req.url.slice(prefix.length));
          if (!file.startsWith(base) || !file.endsWith(".svg")) return next();

          res.setHeader("Content-Type", "image/svg+xml");
          res.setHeader("Cache-Control", "no-cache");
          return server.middlewares.handle(Object.assign(req, { url: `/@fs/${file}` }), res, next);
        }

        return next();
      });
    },

    writeBundle() {
      for (const style of ICON_STYLES) {
        const src = resolve(ICONS_BASE, style);
        const dest = resolve(outDir, `icons/${style}`);

        if (!existsSync(src)) {
          this.warn(`@tabler/icons ${style} not found — skipping icon copy`);
          continue;
        }

        cpSync(src, dest, { recursive: true });
      }
    },
  };
}
