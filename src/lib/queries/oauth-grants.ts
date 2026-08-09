import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { OAuthGrant } from "@supabase/supabase-js";
import { supabase } from "../supabase.ts";

export type { OAuthGrant };

export const oauthGrantKeys = {
  list: ["oauth-grants"] as const,
};

async function fetchOAuthGrants(): Promise<OAuthGrant[]> {
  const { data, error } = await supabase.auth.oauth.listGrants();
  if (error) throw error;
  return data ?? [];
}

export const oauthGrantsQueryOptions = queryOptions({
  queryKey: oauthGrantKeys.list,
  queryFn: fetchOAuthGrants,
});

export function useRevokeOAuthGrant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: oauthGrantKeys.list });
    },
  });
}
