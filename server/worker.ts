import { createClient } from "@supabase/supabase-js";
import app from "./index";
import type { AppBindings } from "./lib/supabase";
import { injectOgMeta, type OgMeta } from "./lib/og-meta";

interface Env extends AppBindings {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const SHARE_PATH_RE = /^\/share\/([^/]+)\/?$/;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const shareMatch = url.pathname.match(SHARE_PATH_RE);

    // For /share/:shareId paths, serve SPA HTML with injected OG meta tags
    if (shareMatch) {
      const shareId = shareMatch[1]!;
      const meta = await fetchShareMeta(env, shareId, url.origin);

      // Get the SPA index.html via the ASSETS binding
      const assetResponse = await env.ASSETS.fetch(request);

      if (meta) {
        return injectOgMeta(assetResponse, meta);
      }

      // Share not found — still serve the SPA (it will show its own 404 state)
      return assetResponse;
    }

    // All other requests: delegate to Hono (API routes, MCP, etc.)
    // If Hono doesn't match, Cloudflare's asset handler serves static files.
    return app.fetch(request, env, ctx);
  },
};

async function fetchShareMeta(env: Env, shareId: string, origin: string): Promise<OgMeta | null> {
  const supabaseUrl = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL;
  if (!supabaseUrl || !env.SUPABASE_SECRET_KEY) return null;

  const supabase = createClient(supabaseUrl, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: share } = await supabase.from("plan_shares").select("plan_id, active").eq("id", shareId).single();
  if (!share?.active) return null;

  const { data: plan } = await supabase.from("plans").select("name, goal").eq("id", share.plan_id).single();
  if (!plan) return null;

  const description = plan.goal ?? "Training plan shared on trenuj.se";

  return {
    title: plan.name,
    description,
    imageUrl: `${origin}/api/og/${shareId}`,
    url: `${origin}/share/${shareId}`,
  };
}
