import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../../components/composites/AuthForm/AuthForm.tsx";

export const Route = createFileRoute("/_app/signup")({
  component: () => <AuthForm mode="signup" />,
});
