import type { Session, User } from "@supabase/supabase-js";

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

export function parseStoredSession(raw: string | null): { user: User; session: Session } | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Session;
    if (!data?.user || !data?.access_token) return null;
    return { user: data.user, session: data };
  } catch {
    return null;
  }
}

export function initialAuthState(raw: string | null): AuthState {
  const stored = parseStoredSession(raw);
  if (stored) {
    return { user: stored.user, session: stored.session, loading: false };
  }
  // No cached session: either logged out, or supabase-js is still hydrating
  // (e.g. exchanging the PKCE ?code= after an OAuth redirect).
  return { user: null, session: null, loading: true };
}
