import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { createRootRouteWithContext, Navigate, Outlet, useLocation } from "@tanstack/react-router";
import { ToastProvider } from "../components/primitives/Toast/Toast.tsx";
import { useAuth } from "../lib/auth.ts";
import { activePlanQueryOptions } from "../lib/queries/plans.ts";
import { useRealtimeSync } from "../lib/realtime.ts";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

const PUBLIC_PREFIXES = ["/dev/", "/share/", "/oauth/"];
const PUBLIC_ROUTES = ["/help", "/privacy-policy"];
const AUTH_ROUTES = ["/login", "/signup"];

function RootLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();

  const isPublic = PUBLIC_PREFIXES.some((p) => location.pathname.startsWith(p)) || PUBLIC_ROUTES.includes(location.pathname);
  const isAuthRoute = AUTH_ROUTES.includes(location.pathname);

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

  // Authenticated users on login/signup → redirect to home
  if (user && isAuthRoute) {
    return <Navigate to="/" />;
  }

  // Unauthenticated users on protected routes → redirect to login
  if (!user && !isPublic && !isAuthRoute) {
    return <Navigate to="/login" />;
  }

  return (
    <ToastProvider>
      <Outlet />
    </ToastProvider>
  );
}
