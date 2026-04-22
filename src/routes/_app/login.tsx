import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../../components/composites/AuthForm/AuthForm.tsx";
import { parseAuthRouteSearch } from "../../lib/auth-redirect.ts";

export const Route = createFileRoute("/_app/login")({
  validateSearch: (search: Record<string, unknown>) => parseAuthRouteSearch(search),
  component: LoginPage,
});

function LoginPage() {
  const { email, returnTo } = Route.useSearch();
  return <AuthForm mode="login" initialEmail={email} returnTo={returnTo} />;
}
