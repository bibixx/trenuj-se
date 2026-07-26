-- Custom SQL migration file, put your code below! --

-- Compare-and-swap for plans.agent_memory, performed inside a SQL function so the expected
-- (old) content is sent in the request BODY instead of the URL. The MCP tool previously ran
-- .eq('agent_memory', <whole doc>) as the CAS guard, which puts the entire notepad in the
-- PostgREST query string; once the document grows past the gateway URL limit (~32 KB) every
-- edit_plan_memory call 400s ("Bad Request"), including deletions. Routing the CAS through an
-- RPC keeps the URL tiny and preserves exact-match semantics.
--
-- Returns the updated row, or zero rows when the guard misses (concurrent write) so the caller
-- can raise CONFLICT. `IS NOT DISTINCT FROM` handles the NULL (empty notepad) case, unifying the
-- old .is('agent_memory', null) / .eq(...) branching. updated_at is left to the existing
-- BEFORE UPDATE trigger. SECURITY INVOKER (default): the MCP client authenticates with the
-- service role, so RLS is bypassed and the p_user_id predicate is the authorization guard.

CREATE OR REPLACE FUNCTION public.edit_plan_memory_cas(
  p_plan_id uuid,
  p_user_id uuid,
  p_expected text,
  p_next text
)
RETURNS TABLE (id uuid, agent_memory text, updated_at timestamptz)
LANGUAGE sql
AS $$
  UPDATE public.plans
     SET agent_memory = p_next
   WHERE public.plans.id = p_plan_id
     AND public.plans.user_id = p_user_id
     AND public.plans.agent_memory IS NOT DISTINCT FROM p_expected
  RETURNING public.plans.id, public.plans.agent_memory, public.plans.updated_at;
$$;

REVOKE ALL ON FUNCTION public.edit_plan_memory_cas(uuid, uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_plan_memory_cas(uuid, uuid, text, text) TO service_role;

-- Make the new function visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
