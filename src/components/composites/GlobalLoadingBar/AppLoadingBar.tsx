import { useIsFetching } from "@tanstack/react-query";
import { GlobalLoadingBar } from "./GlobalLoadingBar.tsx";
import { useDelayedLoading } from "./useDelayedLoading.ts";
import styles from "./GlobalLoadingBar.module.css";

/**
 * App-wide loading bar. Shows while a query is revalidating data it already holds
 * (stale-while-revalidate) — i.e. a background refresh of on-screen data. Cold loads
 * (no cached data yet) are excluded; those render skeletons instead.
 */
export function AppLoadingBar() {
  const isRevalidating = useIsFetching({ predicate: (query) => query.state.data !== undefined && query.isStale() }) > 0;
  const visible = useDelayedLoading(isRevalidating);

  return <GlobalLoadingBar visible={visible} className={styles.fixed} />;
}
