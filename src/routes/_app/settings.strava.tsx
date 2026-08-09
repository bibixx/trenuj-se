import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "../../components/primitives/Badge/Badge.tsx";
import { Button } from "../../components/primitives/Button/Button.tsx";
import { Card } from "../../components/primitives/Card/Card.tsx";
import { Dialog } from "../../components/primitives/Dialog/Dialog.tsx";
import { StravaConnectButton } from "../../components/domain/StravaConnectButton/StravaConnectButton.tsx";
import { apiFetch } from "../../lib/api.ts";
import { useAuth } from "../../lib/auth.ts";
import { profileKeys, profileQueryOptions } from "../../lib/queries/profile.ts";
import { queryClient } from "../../lib/query-client.ts";
import type { Profile } from "../../lib/types.ts";
import styles from "./settings.module.css";

interface StravaSearch {
  strava?: string;
  message?: string;
}

export const Route = createFileRoute("/_app/settings/strava")({
  component: SettingsStravaPage,
  validateSearch: (search: Record<string, unknown>): StravaSearch => ({
    strava: (search.strava as string) ?? undefined,
    message: (search.message as string) ?? undefined,
  }),
});

function SettingsStravaPage() {
  const { user } = useAuth();
  const { strava: stravaParam, message: messageParam } = Route.useSearch();

  const { data: profile } = useQuery({
    ...profileQueryOptions,
    enabled: !!user,
  });

  return <StravaSection profile={profile ?? null} stravaParam={stravaParam} messageParam={messageParam} />;
}

function StravaSection({ profile, stravaParam, messageParam }: { profile: Profile | null; stravaParam?: string; messageParam?: string }) {
  const isConnected = !!profile?.stravaAthleteId;
  const navigate = useNavigate();
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Capture OAuth-callback feedback from the URL, then strip the params so a
  // reload or back-navigation doesn't re-show a stale banner.
  useEffect(() => {
    if (!stravaParam) return;
    if (stravaParam === "connected") setFeedback("Strava connected");
    else if (stravaParam === "cancelled") setFeedback("Strava connection cancelled.");
    else if (stravaParam === "error") setFeedback(messageParam?.trim() || "Couldn't connect Strava");
    void navigate({ to: "/settings/strava", search: {}, replace: true });
  }, [stravaParam, messageParam, navigate]);

  const handleDisconnect = async () => {
    setConfirmOpen(false);
    setDisconnecting(true);
    setFeedback(null);
    try {
      await apiFetch("/api/strava/disconnect", { method: "POST" });
      queryClient.invalidateQueries({ queryKey: profileKeys.current });
      setFeedback("Strava disconnected");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Couldn't disconnect Strava");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Card as="section" className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Strava</h2>
        {isConnected && <Badge variant="status">Connected · Athlete #{profile.stravaAthleteId}</Badge>}
      </div>
      <p className={styles.sectionDescription}>
        Connect Strava to match your runs, rides, and swims to the workouts in your plan.
        <br />
        New activities link automatically; you can also link one yourself with the “Link Strava activity” button.
      </p>
      <div className={styles.buttonRow}>
        {isConnected ? (
          <Button variant="destructive" onClick={() => setConfirmOpen(true)} loading={disconnecting}>
            Disconnect
          </Button>
        ) : (
          <StravaConnectButton callback="/settings/strava?strava=connected" onError={setFeedback} />
        )}
      </div>
      {feedback && <p className={styles.hint}>{feedback}</p>}

      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Content>
          <Dialog.Close />
          <Dialog.Title>Disconnect Strava</Dialog.Title>
          <Dialog.Description>Activity links will remain, but no new activities will sync. This can be reconnected later.</Dialog.Description>
          <div className={styles.dialogActions}>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </Card>
  );
}
