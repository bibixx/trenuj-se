import { useEffect, useRef, useState } from "react";

/**
 * Gates a loading flag to avoid flicker. The bar only appears if `active` stays
 * true past `showDelayMs`, and once shown it stays visible at least `minVisibleMs`.
 * This keeps sub-100ms revalidations (common over the warm IndexedDB cache) from flashing.
 */
export function useDelayedLoading(active: boolean, showDelayMs = 180, minVisibleMs = 450): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(showTimer.current);
    clearTimeout(hideTimer.current);

    if (active && !visible) {
      showTimer.current = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, showDelayMs);
    } else if (!active && visible) {
      const elapsed = shownAt.current ? Date.now() - shownAt.current : minVisibleMs;
      hideTimer.current = setTimeout(() => setVisible(false), Math.max(0, minVisibleMs - elapsed));
    }

    return () => {
      clearTimeout(showTimer.current);
      clearTimeout(hideTimer.current);
    };
  }, [active, visible, showDelayMs, minVisibleMs]);

  return visible;
}
