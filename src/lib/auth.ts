import { useEffect, useState } from "react";
import type { AuthState } from "./auth-session.ts";
import { initialAuthState } from "./auth-session.ts";
import { queryClient } from "./query-client.ts";
import { indexedDbPersister } from "./query-persister.ts";
import { supabase } from "./supabase.ts";

function getStorageKey(): string {
  const url = new URL(import.meta.env.VITE_SUPABASE_URL as string);
  const projectRef = url.hostname.split(".")[0];
  return `sb-${projectRef}-auth-token`;
}

function getInitialAuthState(): AuthState {
  try {
    return initialAuthState(localStorage.getItem(getStorageKey()));
  } catch {
    return initialAuthState(null);
  }
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(getInitialAuthState);

  useEffect(() => {
    // Get initial session — getSession() awaits supabase-js init, including
    // the PKCE code exchange after an OAuth redirect
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({ user: session?.user ?? null, session, loading: false });
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      setState({ user, session, loading: false });

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
