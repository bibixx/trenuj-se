import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { PageLayout } from "../../components/composites/PageLayout/PageLayout.tsx";
import { useAuth } from "../../lib/auth.ts";
import { profileQueryOptions } from "../../lib/queries/profile.ts";
import { useSettingsRealtimeSync } from "../../lib/realtime.ts";
import { hasFlag } from "../../lib/types.ts";
import styles from "./settings.module.css";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    ...profileQueryOptions,
    enabled: !!user,
  });

  useSettingsRealtimeSync(user?.id ?? null);

  return (
    <PageLayout>
      <h1 className={styles.heading}>Settings</h1>

      <nav className={styles.tabs} aria-label="Settings">
        <Link to="/settings/account" className={styles.tab} activeProps={{ "aria-current": "page" }}>
          Account
        </Link>
        <Link to="/settings/strava" className={styles.tab} activeProps={{ "aria-current": "page" }}>
          Strava
        </Link>
        <Link to="/settings/agent" className={styles.tab} activeProps={{ "aria-current": "page" }}>
          AI agent
        </Link>
        {hasFlag(profile, "companion_app") && (
          <Link to="/settings/watch" className={styles.tab} activeProps={{ "aria-current": "page" }}>
            Apple Watch
          </Link>
        )}
      </nav>

      <Outlet />
    </PageLayout>
  );
}
