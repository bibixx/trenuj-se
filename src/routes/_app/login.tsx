import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../../components/composites/AuthForm/AuthForm.tsx";

export const Route = createFileRoute("/_app/login")({
  component: () => <AuthForm mode="login" />,
});
