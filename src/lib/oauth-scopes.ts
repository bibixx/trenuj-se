/**
 * Labels for the identity scopes Supabase's OAuth 2.1 server can issue.
 * Its discovery document advertises only: openid, profile, email, phone, offline_access.
 */
const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirm your identity",
  profile: "View your basic profile information",
  email: "View your email address",
  phone: "View your phone number",
  offline_access: "Stay connected without asking you to sign in again",
};

export interface ScopePermission {
  scope: string;
  /** Human-readable label, or null when the scope is unknown (render the raw scope). */
  label: string | null;
}

export function describeScopes(scope: string): ScopePermission[] {
  return scope
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => ({ scope: s, label: SCOPE_LABELS[s] ?? null }));
}
