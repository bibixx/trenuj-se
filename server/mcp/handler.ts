import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Context } from "hono";
import { trainingGuideMarkdown } from "./resources/training-guide";
import { sqlSchemaGuideMarkdown } from "./resources/sql-schema";
import { authenticateMcpRequest, createMcpContext, errorPayload, type McpContext } from "./context";
import { getProtectedResourceMetadataUrl } from "./oauth";
import { createServerSupabase } from "../lib/supabase";
import { authenticateMcpConnectorToken } from "../lib/mcp-connector-tokens";
import { registerPlanTools } from "./tools/plans";
import { registerWorkoutTools } from "./tools/workouts";
import { registerNoteTools } from "./tools/notes";
import { registerAthleteTools } from "./tools/athlete";
import { registerActivityTools } from "./tools/activities";
import { registerIconTools } from "./tools/icons";
import { registerQueryTools } from "./tools/query";
import type { AppBindings } from "../lib/supabase";

function buildServer(ctx: McpContext) {
  const server = new McpServer(
    {
      name: "training-plan-platform",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    },
  );

  server.registerResource(
    "training-plan-guide",
    "guide://training-plan-guide",
    {
      title: "Training Plan Guide",
      description: "Conventions for workout descriptions, metadata, naming, colors, icons, and mermaid usage.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: trainingGuideMarkdown,
        },
      ],
    }),
  );

  server.registerResource(
    "sql-schema",
    "guide://sql-schema",
    {
      title: "SQL Schema Guide",
      description: "Table/column reference, join keys, hydration semantics, and worked examples for the run_sql tool.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: sqlSchemaGuideMarkdown,
        },
      ],
    }),
  );

  registerPlanTools(server, ctx);
  registerWorkoutTools(server, ctx);
  registerNoteTools(server, ctx);
  registerAthleteTools(server, ctx);
  registerActivityTools(server, ctx);
  registerIconTools(server);
  registerQueryTools(server, ctx);

  return server;
}

// The MCP tool catalog is identical for every user and every request, but the SDK rebuilds
// the server (~2ms) and re-converts all tool input schemas to JSON Schema (~6ms) on every
// `tools/list`. On Cloudflare's 10ms free-tier CPU budget that busts the limit on a cold
// (low-traffic) isolate — exactly the connector path. The catalog is static, so compute the
// `tools/list` result once per isolate via a throwaway in-memory round-trip and reuse it.
let cachedToolsListResult: unknown = null;

async function getToolsListResult(): Promise<unknown> {
  if (cachedToolsListResult !== null) return cachedToolsListResult;

  const stubCtx = { supabase: null, userId: "", bindings: {} } as unknown as McpContext;
  const server = buildServer(stubCtx);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);

  const body = { jsonrpc: "2.0", id: 0, method: "tools/list", params: {} };
  const response = await transport.handleRequest(
    new Request("https://mcp.internal/", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify(body),
    }),
    { parsedBody: body },
  );

  const payload = (await response.json()) as { result?: unknown };
  cachedToolsListResult = payload.result ?? { tools: [] };
  return cachedToolsListResult;
}

function isToolsListRequest(body: unknown): body is { id?: string | number | null } {
  return typeof body === "object" && body !== null && !Array.isArray(body) && (body as { method?: unknown }).method === "tools/list";
}

// Warm the cache at isolate startup (fire-and-forget) so the first real `tools/list` is
// already cheap instead of paying the conversion cost inline on a cold isolate.
void getToolsListResult().catch(() => {});

async function handleAuthenticatedMcpRequest(
  c: Context<{ Bindings: AppBindings }>,
  authenticate: (c: Context<{ Bindings: AppBindings }>) => Promise<McpContext>,
  options: { challengeResourcePath?: string } = {},
) {
  // Stateless MCP on Cloudflare Workers does not expose a standalone server->client
  // SSE stream. A GET opens an SSE ReadableStream that never terminates within the
  // request lifecycle, so the Workers runtime cancels it as a hung request
  // ("code had hung and would never generate a response"). Reject GET explicitly
  // (spec-compliant) instead of hanging.
  if (c.req.method === "GET") {
    return c.json({ code: "METHOD_NOT_ALLOWED", message: "This MCP endpoint does not support a standalone SSE stream; use POST." }, 405, {
      Allow: "POST, DELETE",
    });
  }

  try {
    const auth = await authenticate(c);

    // Serve the static tool catalog from the per-isolate cache so `tools/list` skips the
    // buildServer + schema-conversion cost that busts the 10ms CPU budget on a cold isolate.
    // Clone the request to peek at the body without consuming it for the fall-through path.
    const peeked = await c.req.raw
      .clone()
      .json()
      .catch(() => null);
    if (isToolsListRequest(peeked)) {
      return c.json({ jsonrpc: "2.0", id: peeked.id ?? null, result: await getToolsListResult() });
    }

    const server = buildServer(auth);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      // Return a single JSON body per request instead of an SSE stream. The SSE path
      // closes its ReadableStream from a deferred async task that the Workers runtime
      // never runs before its hang-detector fires; JSON mode resolves a Promise<Response>
      // the runtime awaits, which is Workers-compatible.
      enableJsonResponse: true,
    });

    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  } catch (error) {
    const payload = errorPayload(error);
    const status = payload.code === "AUTH_ERROR" ? 401 : 500;
    const response = c.json(payload, status);

    if (status === 401 && options.challengeResourcePath) {
      response.headers.set("WWW-Authenticate", `Bearer resource_metadata="${getProtectedResourceMetadataUrl(c.env, options.challengeResourcePath)}"`);
    }

    return response;
  }
}

export async function handleMcpRequest(c: Context<{ Bindings: AppBindings }>) {
  return handleAuthenticatedMcpRequest(c, authenticateMcpRequest, { challengeResourcePath: "/mcp" });
}

export async function handleClaudeMcpRequest(c: Context<{ Bindings: AppBindings }>) {
  return handleAuthenticatedMcpRequest(c, async (requestContext) => {
    const connectorToken = requestContext.req.param("connectorToken");

    if (!connectorToken) {
      throw new Error("Missing connector token");
    }

    const supabase = createServerSupabase(requestContext);
    const userId = await authenticateMcpConnectorToken(supabase, connectorToken);

    return createMcpContext(requestContext, userId, supabase);
  });
}
