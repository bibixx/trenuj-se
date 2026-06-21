import { useIsFetching } from "@tanstack/react-query";
import { GlobalLoadingBar } from "./GlobalLoadingBar.tsx";
import { useDelayedLoading } from "./useDelayedLoading.ts";
import { useLingerUntilIteration } from "./useLingerUntilIteration.ts";
import styles from "./GlobalLoadingBar.module.css";

/**
 * App-wide loading bar. Shows while a query is revalidating data it already holds
 * (stale-while-revalidate) — i.e. a background refresh of on-screen data. Cold loads
 * (no cached data yet) are excluded; those render skeletons instead.
 */
export function AppLoadingBar() {
  const isRevalidating = useIsFetching({ predicate: (query) => query.state.data !== undefined && query.isStale() }) > 0;
  const active = useDelayedLoading(isRevalidating);
  // Once shown, let the sweep finish its current cycle rather than freezing mid-track on hide.
  const { visible, onAnimationIteration } = useLingerUntilIteration(active);

  return <GlobalLoadingBar visible={visible} onAnimationIteration={onAnimationIteration} className={styles.fixed} />;
}
