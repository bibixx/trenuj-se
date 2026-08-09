import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppleWatchSection } from "../../components/domain/AppleWatchSection/AppleWatchSection.tsx";
import { useAuth } from "../../lib/auth.ts";
import { profileQueryOptions } from "../../lib/queries/profile.ts";
import { hasFlag } from "../../lib/types.ts";

export const Route = createFileRoute("/_app/settings/watch")({
  component: SettingsWatchPage,
});

function SettingsWatchPage() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    ...profileQueryOptions,
    enabled: !!user,
  });

  // Wait for the profile before deciding — avoids a redirect flash while loading.
  if (!profile) return null;
  if (!hasFlag(profile, "companion_app")) return <Navigate to="/settings/account" replace />;

  return <AppleWatchSection />;
}
