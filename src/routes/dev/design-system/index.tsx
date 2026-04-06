import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dev/design-system/")({
  beforeLoad: () => {
    throw redirect({ to: "/dev/design-system/tokens" });
  },
});
