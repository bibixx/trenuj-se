import { createFileRoute, redirect } from "@tanstack/react-router";

interface SettingsIndexSearch {
  strava?: string;
  message?: string;
}

// Redirect-only route: /settings lands on the Account tab, and legacy
// /settings?strava=… URLs (incl. OAuth states signed before the tab split)
// land on the Strava tab with their feedback params intact.
export const Route = createFileRoute("/_app/settings/")({
  validateSearch: (search: Record<string, unknown>): SettingsIndexSearch => ({
    strava: (search.strava as string) ?? undefined,
    message: (search.message as string) ?? undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.strava) {
      throw redirect({ to: "/settings/strava", search, replace: true });
    }
    throw redirect({ to: "/settings/account", replace: true });
  },
});
