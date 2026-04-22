import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Context } from "hono";
import { trainingGuideMarkdown } from "./resources/training-guide";
import { authenticateMcpRequest, errorPayload, type McpContext } from "./context";
import { getProtectedResourceMetadataUrl } from "./oauth";
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

function escapeAuthHeaderValue(value: string) {
  return value.replace(/["\\]/g, "\\$&");
}

export async function handleMcpRequest(c: Context<{ Bindings: AppBindings }>) {
  try {
    const auth = await authenticateMcpRequest(c);
    const server = buildServer(auth);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  } catch (error) {
    const payload = errorPayload(error);
    const status = payload.code === "AUTH_ERROR" ? 401 : 500;

    if (status === 401) {
      const message = payload.message;
      const response = c.json(
        {
          ...payload,
          error: "invalid_token",
          error_description: message,
        },
        401,
      );
      response.headers.set(
        "WWW-Authenticate",
        `Bearer realm="OAuth", resource_metadata="${getProtectedResourceMetadataUrl(c.env, "/mcp")}", error="invalid_token", error_description="${escapeAuthHeaderValue(message)}"`,
      );
      return response;
    }

    return c.json(payload, status);
  }
}
