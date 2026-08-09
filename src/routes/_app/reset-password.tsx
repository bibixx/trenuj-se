import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordRequestForm } from "../../components/composites/AuthForm/ResetPasswordRequestForm.tsx";
import { parseAuthRouteSearch } from "../../lib/auth-redirect.ts";

export const Route = createFileRoute("/_app/reset-password")({
  validateSearch: (search: Record<string, unknown>) => parseAuthRouteSearch(search),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { email, returnTo } = Route.useSearch();
  return <ResetPasswordRequestForm initialEmail={email} returnTo={returnTo} />;
}
