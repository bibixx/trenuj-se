import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../../components/composites/AuthForm/AuthForm.tsx";
import { parseAuthRouteSearch } from "../../lib/auth-redirect.ts";

export const Route = createFileRoute("/_app/signup")({
  validateSearch: (search: Record<string, unknown>) => parseAuthRouteSearch(search),
  component: SignupPage,
});

function SignupPage() {
  const { email, returnTo } = Route.useSearch();
  return <AuthForm mode="signup" initialEmail={email} returnTo={returnTo} />;
}
