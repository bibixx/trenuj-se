import { Hono } from "hono";
import type { Context } from "hono";
import type { AppBindings } from "../lib/supabase";
import { getUpstreamAuthorizationServerIssuer } from "../mcp/oauth";

const oauthProxyRoutes = new Hono<{ Bindings: AppBindings }>();

function buildUpstreamUrl(bindings: AppBindings, path: string) {
  return new URL(path.replace(/^\//, ""), `${getUpstreamAuthorizationServerIssuer(bindings)}/`);
}

async function proxyRequest(c: Context<{ Bindings: AppBindings }>, path: string) {
  const body = c.req.method === "GET" || c.req.method === "HEAD" ? undefined : await c.req.arrayBuffer();
  const headers = new Headers();

  for (const headerName of ["accept", "authorization", "content-type"]) {
    const value = c.req.header(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }

  const upstream = await fetch(buildUpstreamUrl(c.env, path).toString(), {
    method: c.req.method,
    headers,
    body,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}

oauthProxyRoutes.get("/authorize", async (c) => {
  const requestUrl = new URL(c.req.url);
  const authorizeUrl = buildUpstreamUrl(c.env, "/oauth/authorize");
  authorizeUrl.search = requestUrl.search;
  return c.redirect(authorizeUrl.toString(), 302);
});

oauthProxyRoutes.post("/token", (c) => proxyRequest(c, "/oauth/token"));
oauthProxyRoutes.post("/register", (c) => proxyRequest(c, "/oauth/clients/register"));

export default oauthProxyRoutes;
