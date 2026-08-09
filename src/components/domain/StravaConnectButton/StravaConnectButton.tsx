import clsx from "clsx";
import { useState } from "react";
import { apiFetch } from "../../../lib/api.ts";
import styles from "./StravaConnectButton.module.css";

interface StravaConnectButtonProps {
  /** App-relative path Strava redirects back to on success, e.g. "/settings/strava?strava=connected". */
  callback: string;
  onError?: (message: string) => void;
  className?: string;
}

/** Strava-branded button that starts the OAuth connect flow. */
export function StravaConnectButton({ callback, onError, className }: StravaConnectButtonProps) {
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await apiFetch(`/api/strava/auth?callback=${encodeURIComponent(callback)}`);
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Couldn't connect to Strava");
      setConnecting(false);
    }
  };

  return (
    <button className={clsx(styles.stravaButton, className)} onClick={handleConnect} disabled={connecting}>
      {connecting ? "Connecting…" : "Connect with Strava"}
    </button>
  );
}
