import app from "../../server/index.ts";
import { MOCK_ENV } from "./mock-env.ts";
import type { AppBindings } from "../../server/lib/supabase.ts";

let jsonRpcId = 1;

function nextId() {
  return jsonRpcId++;
}

export function resetMcpIds() {
  jsonRpcId = 1;
}

const DEFAULT_TOKEN = "mock-oauth-access-token";

export async function mcpRequest(method: string, params: Record<string, unknown> = {}, options: { token?: string | false; env?: AppBindings } = {}) {
  const env = options.env ?? MOCK_ENV;
  const token = options.token === false ? undefined : (options.token ?? DEFAULT_TOKEN);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: nextId(),
    method,
    params,
  });

  return app.request("/mcp", { method: "POST", headers, body }, env);
}

export async function mcpInitialize(options: { token?: string | false; env?: AppBindings } = {}) {
  return mcpRequest(
    "initialize",
    {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test-client", version: "0.0.1" },
    },
    options,
  );
}

export async function mcpCallTool(name: string, args: Record<string, unknown> = {}, options: { token?: string | false; env?: AppBindings } = {}) {
  return mcpRequest("tools/call", { name, arguments: args }, options);
}

export async function parseMcpResponse(response: Response): Promise<{
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        try {
          return JSON.parse(data);
        } catch {
          continue;
        }
      }
    }
    throw new Error(`No valid JSON-RPC message found in SSE stream: ${text}`);
  }

  return response.json();
}

type JsonRpcResult = { result?: unknown };

export function extractToolResult<T = Record<string, unknown>>(rpcResult: JsonRpcResult): { result: T; warnings?: string[] } | null {
  const obj = rpcResult.result;
  if (obj == null || typeof obj !== "object") return null;
  const content = (obj as Record<string, unknown>).content;
  if (!Array.isArray(content) || content.length === 0) return null;
  const text = (content[0] as Record<string, unknown> | undefined)?.text;
  if (typeof text !== "string") return null;
  return JSON.parse(text);
}

export function extractToolError(rpcResult: JsonRpcResult): { code: string; message: string } | null {
  const obj = rpcResult.result;
  if (obj == null || typeof obj !== "object") return null;
  if (!(obj as Record<string, unknown>).isError) return null;
  const content = (obj as Record<string, unknown>).content;
  if (!Array.isArray(content) || content.length === 0) return null;
  const text = (content[0] as Record<string, unknown> | undefined)?.text;
  if (typeof text !== "string") return null;
  return JSON.parse(text) as { code: string; message: string };
}
