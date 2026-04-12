import type { Session, User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { queryClient } from "./query-client.ts";
import { indexedDbPersister } from "./query-persister.ts";
import { supabase } from "./supabase.ts";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

function getStorageKey(): string {
  const url = new URL(import.meta.env.VITE_SUPABASE_URL as string);
  const projectRef = url.hostname.split(".")[0];
  return `sb-${projectRef}-auth-token`;
}

function readSessionFromStorage(): { user: User; session: Session } | null {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return null;
    const data = JSON.parse(raw) as Session;
    if (!data?.user || !data?.access_token) return null;
    return { user: data.user, session: data };
  } catch {
    return null;
  }
}

function getInitialAuthState(): AuthState {
  const stored = readSessionFromStorage();
  if (stored) {
    return { user: stored.user, session: stored.session, loading: false };
  }
  return { user: null, session: null, loading: false };
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(getInitialAuthState);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({ user: session?.user ?? null, session, loading: false });
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      setState((prev) => ({ ...prev, user, session }));

      // Clean up the leftover # fragment after OAuth redirect
      if (event === "SIGNED_IN" && window.location.hash === "") {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }

      // On logout, clear all cached data
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        indexedDbPersister.removeClient();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return state;
}
