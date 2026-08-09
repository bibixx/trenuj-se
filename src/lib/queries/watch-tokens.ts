import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api.ts";

export interface WatchToken {
  id: string;
  name: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateWatchTokenResult {
  token: WatchToken;
  /** Shown once — the server only stores a hash. */
  rawToken: string;
}

export const watchTokenKeys = {
  list: ["watch-tokens"] as const,
};

async function fetchWatchTokens(): Promise<WatchToken[]> {
  const res = await apiFetch("/api/watch/tokens");
  const { tokens } = (await res.json()) as { tokens: WatchToken[] };
  return tokens.filter((t) => t.revokedAt === null);
}

export const watchTokensQueryOptions = queryOptions({
  queryKey: watchTokenKeys.list,
  queryFn: fetchWatchTokens,
});

export function useCreateWatchToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const res = await apiFetch("/api/watch/tokens", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      return (await res.json()) as CreateWatchTokenResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchTokenKeys.list });
    },
  });
}

export function useRevokeWatchToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tokenId: string) => {
      await apiFetch(`/api/watch/tokens/${tokenId}`, { method: "DELETE" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: watchTokenKeys.list });
    },
  });
}
