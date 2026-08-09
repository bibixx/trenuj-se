import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "../components/primitives/Button/Button.tsx";
import { Card } from "../components/primitives/Card/Card.tsx";
import { buildReturnTo } from "../lib/auth-redirect.ts";
import { describeScopes } from "../lib/oauth-scopes.ts";
import { useAuth } from "../lib/auth.ts";
import { supabase } from "../lib/supabase.ts";
import styles from "./oauth.consent.module.css";

const searchSchema = z.object({
  authorization_id: z.string().min(1),
});

export const Route = createFileRoute("/oauth/consent")({
  component: OAuthConsentPage,
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

/**
 * The MCP endpoint authorises by user identity, not OAuth scope, so approving
 * grants everything the MCP server exposes. Keep this list in sync with server/mcp/tools/.
 */
const GRANT_CAPABILITIES = ["View and edit your training plans and workouts", "Read and write plan notes and agent memory", "Read your linked Strava activity data"] as const;

interface OAuthAuthorizationDetails {
  authorization_id: string;
  client: { name: string };
  scope: string;
}

interface OAuthRedirect {
  redirect_url: string;
}

type AuthorizationResponse = OAuthAuthorizationDetails | OAuthRedirect;

async function oauthFetch<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<{ data: T | null; error: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    return { data: null, error: "Not authenticated" };
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const responseBody = await response.json().catch(() => ({}));
    return {
      data: null,
      error: (responseBody as Record<string, string>).error_description ?? (responseBody as Record<string, string>).msg ?? `Request failed (${response.status})`,
    };
  }

  const data = await response.json();
  return { data: data as T, error: null };
}

function isRedirect(data: AuthorizationResponse): data is OAuthRedirect {
  return "redirect_url" in data;
}

function OAuthConsentPage() {
  const { user, loading: authLoading } = useAuth();
  const { authorization_id } = Route.useSearch();

  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    async function fetchDetails() {
      const { data, error: fetchError } = await oauthFetch<AuthorizationResponse>(`/oauth/authorizations/${authorization_id}`, "GET");

      if (fetchError || !data) {
        setError(fetchError ?? "Couldn't load authorisation details");
        setLoading(false);
        return;
      }

      if (isRedirect(data)) {
        window.location.href = data.redirect_url;
        return;
      }

      setDetails(data);
      setLoading(false);
    }

    fetchDetails();
  }, [authorization_id, user, authLoading]);

  const handleApprove = useCallback(async () => {
    setSubmitting(true);
    setError(null);

    const { data, error: approveError } = await oauthFetch<OAuthRedirect>(`/oauth/authorizations/${authorization_id}/consent`, "POST", { action: "approve" });

    if (approveError || !data) {
      setError(approveError ?? "Couldn't approve the request");
      setSubmitting(false);
      return;
    }

    window.location.href = data.redirect_url;
  }, [authorization_id]);

  const handleDeny = useCallback(async () => {
    setSubmitting(true);
    setError(null);

    const { data, error: denyError } = await oauthFetch<OAuthRedirect>(`/oauth/authorizations/${authorization_id}/consent`, "POST", { action: "deny" });

    if (denyError || !data) {
      setError(denyError ?? "Couldn't deny the request");
      setSubmitting(false);
      return;
    }

    window.location.href = data.redirect_url;
  }, [authorization_id]);

  if (authLoading) {
    return <div className={styles.page} />;
  }

  if (!user) {
    return <Navigate to="/login" search={{ returnTo: buildReturnTo(window.location.pathname, window.location.search, window.location.hash) }} />;
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <Card className={styles.card}>
          <p className={styles.description}>Loading authorisation details…</p>
        </Card>
      </div>
    );
  }

  if (!details) {
    return (
      <div className={styles.page}>
        <Card className={styles.card}>
          <h1 className={styles.title}>Authorisation error</h1>
          <p className={styles.error}>{error ?? "Invalid authorisation request"}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <h1 className={styles.title}>Authorise application</h1>
        <p className={styles.description}>
          <span className={styles.clientName}>{details.client.name}</span> wants to access your trenuj.se account.
        </p>
        <p className={styles.permissionsIntro}>Approving will allow it to:</p>
        <ul className={styles.permissions}>
          {GRANT_CAPABILITIES.map((capability) => (
            <li key={capability}>{capability}</li>
          ))}
          {describeScopes(details.scope).map(({ scope, label }) => (
            <li key={scope}>{label ?? <code className={styles.rawScope}>{scope}</code>}</li>
          ))}
        </ul>
        <p className={styles.revocationNote}>Access lasts until you revoke it under Settings → AI agent → Connected applications.</p>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <Button onClick={handleApprove} loading={submitting}>
            Approve
          </Button>
          <Button onClick={handleDeny} disabled={submitting} variant="secondary">
            Deny
          </Button>
        </div>
      </Card>
    </div>
  );
}
