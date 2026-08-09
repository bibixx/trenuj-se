import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api.ts";

export interface McpConnectorToken {
  id: string;
  name: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateConnectorTokenResult {
  token: McpConnectorToken;
  /** Shown once — the server only stores a hash. */
  rawToken: string;
  connectorUrl: string;
}

export const mcpConnectorTokenKeys = {
  list: ["mcp-connector-tokens"] as const,
};

async function fetchConnectorTokens(): Promise<McpConnectorToken[]> {
  const res = await apiFetch("/api/mcp/connector-tokens");
  const { tokens } = (await res.json()) as { tokens: McpConnectorToken[] };
  return tokens.filter((t) => t.revokedAt === null);
}

export const mcpConnectorTokensQueryOptions = queryOptions({
  queryKey: mcpConnectorTokenKeys.list,
  queryFn: fetchConnectorTokens,
});

export function useCreateConnectorToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const res = await apiFetch("/api/mcp/connector-tokens", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      return (await res.json()) as CreateConnectorTokenResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mcpConnectorTokenKeys.list });
    },
  });
}

export function useRevokeConnectorToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tokenId: string) => {
      await apiFetch(`/api/mcp/connector-tokens/${tokenId}`, { method: "DELETE" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: mcpConnectorTokenKeys.list });
    },
  });
}
