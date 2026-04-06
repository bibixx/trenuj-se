import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api.ts";
import type { ApiToken } from "../types.ts";

export const tokenKeys = {
  all: ["api-tokens"] as const,
};

async function fetchTokens(): Promise<ApiToken[]> {
  const res = await apiFetch("/api/tokens");
  const body = (await res.json()) as { tokens: Array<Record<string, unknown>> };

  return body.tokens.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    lastUsedAt: (row.last_used_at as string) ?? null,
    createdAt: row.created_at as string,
  }));
}

export const tokensQueryOptions = queryOptions({
  queryKey: tokenKeys.all,
  queryFn: fetchTokens,
});

interface CreateTokenResponse {
  token: string;
  record: { id: string; name: string };
}

interface CreateTokenResult {
  token: string;
  id: string;
  name: string;
}

export function useCreateToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string): Promise<CreateTokenResult> => {
      const res = await apiFetch("/api/tokens", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      const body = (await res.json()) as CreateTokenResponse;
      return { token: body.token, id: body.record.id, name: body.record.name };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tokenKeys.all });
    },
  });
}

export function useRevokeToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tokenId: string) => {
      await apiFetch(`/api/tokens/${tokenId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tokenKeys.all });
    },
  });
}
