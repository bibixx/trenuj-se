import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { createRootRouteWithContext, Navigate, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppLoadingBar } from "../components/composites/GlobalLoadingBar/AppLoadingBar.tsx";
import { ToastProvider } from "../components/primitives/Toast/Toast.tsx";
import { buildReturnTo, getPostAuthRedirect } from "../lib/auth-redirect.ts";
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
  const navigate = useNavigate();

  const isPublic = PUBLIC_PREFIXES.some((p) => location.pathname.startsWith(p)) || PUBLIC_ROUTES.includes(location.pathname);
  const isAuthRoute = AUTH_ROUTES.includes(location.pathname);

  // Authenticated users on login/signup → redirect to returnTo (or home)
  const postAuthTarget = !loading && user && isAuthRoute ? getPostAuthRedirect((location.search as { returnTo?: unknown }).returnTo) : null;

  useEffect(() => {
    if (postAuthTarget) {
      void navigate({ href: postAuthTarget, replace: true });
    }
  }, [postAuthTarget, navigate]);

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

  // Blank shell while the post-auth effect navigates away from login/signup
  if (user && isAuthRoute) {
    return (
      <ToastProvider>
        <div />
      </ToastProvider>
    );
  }

  // Unauthenticated users on protected routes → redirect to login
  if (!user && !isPublic && !isAuthRoute) {
    const returnTo = buildReturnTo(window.location.pathname, window.location.search, window.location.hash);
    return <Navigate to="/login" search={returnTo === "/" ? {} : { returnTo }} />;
  }

  return (
    <ToastProvider>
      <AppLoadingBar />
      <Outlet />
    </ToastProvider>
  );
}
