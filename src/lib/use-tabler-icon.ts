import { useEffect, useState } from "react";

// Lazy loaders — each entry is a () => Promise that fetches the SVG URL on demand.
// Nothing is loaded until an icon is actually rendered.
const loaders = import.meta.glob<{ default: string }>("../../node_modules/@tabler/icons/icons/outline/*.svg", { query: "?url" });

// Build a name → loader lookup (runs once, just iterates keys — no I/O)
const loaderByName = new Map<string, () => Promise<{ default: string }>>();
for (const key in loaders) {
  const match = key.match(/\/([^/]+)\.svg$/);
  const loader = loaders[key];
  if (match?.[1] && loader) {
    loaderByName.set(match[1], loader);
  }
}

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function loadIcon(name: string): Promise<string> {
  if (pending.has(name)) return pending.get(name)!;

  const loader = loaderByName.get(name);
  if (!loader) {
    cache.set(name, "");
    return Promise.resolve("");
  }

  const promise = loader()
    .then((mod) => {
      cache.set(name, mod.default);
      return mod.default;
    })
    .catch(() => {
      cache.set(name, "");
      return "";
    });

  pending.set(name, promise);
  return promise;
}

/**
 * Lazily loads a Tabler icon SVG URL by name.
 * Returns the asset URL once loaded, or `null` while loading.
 * Only icons actually rendered get fetched.
 */
export function useTablerIcon(name: string): string | null {
  const cached = cache.get(name);
  const [url, setUrl] = useState<string | null>(cached ?? null);

  useEffect(() => {
    if (cache.has(name)) {
      setUrl(cache.get(name)!);
      return;
    }

    loadIcon(name).then(setUrl);
  }, [name]);

  return url;
}
