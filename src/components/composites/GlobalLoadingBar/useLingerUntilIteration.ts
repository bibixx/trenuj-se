import { useCallback, useEffect, useRef, useState } from "react";

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Holds `visible` true after `active` drops until the next animation iteration fires
 * (wire the returned `onAnimationIteration` to the looping element). This lets an
 * indeterminate sweep run to the end of its current cycle — where the indicator is
 * off-screen — instead of freezing mid-track when loading ends.
 *
 * Under reduced motion there is no traveling sweep to finish, so it hides immediately;
 * the min-visible floor in `useDelayedLoading` is what keeps short refreshes from flickering there.
 */
export function useLingerUntilIteration(active: boolean): { visible: boolean; onAnimationIteration: () => void } {
  const [visible, setVisible] = useState(active);
  const pendingHide = useRef(false);

  useEffect(() => {
    if (active) {
      pendingHide.current = false;
      setVisible(true);
    } else if (visible) {
      if (prefersReducedMotion()) {
        setVisible(false);
      } else {
        pendingHide.current = true; // wait for the sweep to reach its end before hiding
      }
    }
  }, [active, visible]);

  const onAnimationIteration = useCallback(() => {
    if (pendingHide.current) {
      pendingHide.current = false;
      setVisible(false);
    }
  }, []);

  return { visible, onAnimationIteration };
}
