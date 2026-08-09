import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { McpSettingsSection } from "../../components/domain/McpSettingsSection/McpSettingsSection.tsx";
import { useAuth } from "../../lib/auth.ts";
import { profileQueryOptions } from "../../lib/queries/profile.ts";

export const Route = createFileRoute("/_app/settings/agent")({
  component: SettingsAgentPage,
});

function SettingsAgentPage() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    ...profileQueryOptions,
    enabled: !!user,
  });

  return <McpSettingsSection profile={profile ?? null} />;
}
