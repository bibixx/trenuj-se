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

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
  });

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
