import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { createRootRouteWithContext, Navigate, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppLoadingBar } from "../components/composites/GlobalLoadingBar/AppLoadingBar.tsx";
import { AppSplash } from "../components/composites/AppSplash/AppSplash.tsx";
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
// /reset-password/confirm must stay public: the recovery link creates a real
// session (an AUTH_ROUTES entry would bounce the user away before they set a
// password), while expired-link visitors have no session and still need to see
// the error card rather than a /login redirect.
const PUBLIC_ROUTES = ["/help", "/privacy-policy", "/reset-password/confirm"];
const AUTH_ROUTES = ["/login", "/signup", "/reset-password"];

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
        <AppSplash />
      </ToastProvider>
    );
  }

  // Shell while the post-auth effect navigates away from login/signup
  if (user && isAuthRoute) {
    return (
      <ToastProvider>
        <AppSplash />
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
