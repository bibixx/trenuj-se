import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Context } from "hono";
import { trainingGuideMarkdown } from "./resources/training-guide";
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

  registerPlanTools(server, ctx);
  registerWorkoutTools(server, ctx);
  registerNoteTools(server, ctx);
  registerAthleteTools(server, ctx);
  registerActivityTools(server, ctx);
  registerIconTools(server);

  return server;
}

async function handleAuthenticatedMcpRequest(
  c: Context<{ Bindings: AppBindings }>,
  authenticate: (c: Context<{ Bindings: AppBindings }>) => Promise<McpContext>,
  options: { challengeResourcePath?: string } = {},
) {
  try {
    const auth = await authenticate(c);
    const server = buildServer(auth);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
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
