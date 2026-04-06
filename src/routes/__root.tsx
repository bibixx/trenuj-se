import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet, useLocation } from "@tanstack/react-router";
import { ToastProvider } from "../components/primitives/Toast/Toast.tsx";
import { useAuth } from "../lib/auth.ts";
import { activePlanQueryOptions } from "../lib/queries/plans.ts";
import { useRealtimeSync } from "../lib/realtime.ts";
import { LoginPage } from "../pages/LoginPage.tsx";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const isPublic = location.pathname.startsWith("/dev/") || location.pathname.startsWith("/share/");

  // Fetch active plan when logged in — used to scope Realtime subscriptions
  const { data: activePlan } = useQuery({
    ...activePlanQueryOptions,
    enabled: !!user,
  });

  useRealtimeSync(activePlan?.id ?? null);

  if (loading) {
    return (
      <ToastProvider>
        <div />
      </ToastProvider>
    );
  }

  if (!user && !isPublic) {
    return (
      <ToastProvider>
        <LoginPage />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <Outlet />
    </ToastProvider>
  );
}
