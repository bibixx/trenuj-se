import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

type SupabaseResponse = { data: unknown; error: unknown; count?: number };

type TableConfig = {
  select?: SupabaseResponse;
  insert?: SupabaseResponse;
  update?: SupabaseResponse;
  upsert?: SupabaseResponse;
  delete?: SupabaseResponse;
};

type AuthConfig = {
  getUser?: { data: { user: unknown }; error: unknown };
};

type ThenableChain = Record<string, unknown> & {
  then: (fn: (v: SupabaseResponse) => unknown) => Promise<unknown>;
  catch: (fn: (e: unknown) => unknown) => Promise<unknown>;
};

function makeThenableChain(chain: Record<string, unknown>, resolve: () => SupabaseResponse): ThenableChain {
  const thenableChain = chain as ThenableChain;
  thenableChain.then = (fn: (v: SupabaseResponse) => unknown) => Promise.resolve(resolve()).then(fn);
  thenableChain.catch = (fn: (e: unknown) => unknown) => Promise.resolve(resolve()).catch(fn);
  return thenableChain;
}

function createChain(resolve: () => SupabaseResponse): ThenableChain {
  const chain: Record<string, unknown> = {};
  const passthrough = (..._args: unknown[]) => chain;

  chain.select = vi.fn((..._args: unknown[]) => createChain(resolve));
  chain.insert = vi.fn(passthrough);
  chain.update = vi.fn(passthrough);
  chain.upsert = vi.fn(passthrough);
  chain.delete = vi.fn(() => {
    const deleteChain = createChain(resolve);
    const result = resolve();
    deleteChain.then = (fn: (v: SupabaseResponse) => unknown) => Promise.resolve(result).then(fn);
    deleteChain.catch = (fn: (e: unknown) => unknown) => Promise.resolve(result).catch(fn);
    return deleteChain;
  });
  chain.eq = vi.fn(passthrough);
  chain.neq = vi.fn(passthrough);
  chain.in = vi.fn(passthrough);
  chain.is = vi.fn(passthrough);
  chain.gte = vi.fn(passthrough);
  chain.lte = vi.fn(passthrough);
  chain.lt = vi.fn(passthrough);
  chain.gt = vi.fn(passthrough);
  chain.order = vi.fn(passthrough);
  chain.limit = vi.fn(passthrough);
  chain.range = vi.fn(passthrough);
  chain.single = vi.fn(() => resolve());
  chain.maybeSingle = vi.fn(() => resolve());

  return makeThenableChain(chain, resolve);
}

export function createMockSupabase(
  config: {
    tables?: Record<string, TableConfig>;
    auth?: AuthConfig;
  } = {},
) {
  const tables = config.tables ?? {};
  const authConfig = config.auth ?? {};
  const calls: Array<{ table: string; operation: string; args: unknown[] }> = [];

  const from = vi.fn((table: string) => {
    const tableConfig = tables[table] ?? {};
    const defaultResponse: SupabaseResponse = { data: [], error: null };

    const chain = createChain(() => tableConfig.select ?? defaultResponse);

    chain.insert = vi.fn((...args: unknown[]) => {
      calls.push({ table, operation: "insert", args });
      return createChain(() => tableConfig.insert ?? defaultResponse);
    });

    chain.update = vi.fn((...args: unknown[]) => {
      calls.push({ table, operation: "update", args });
      return createChain(() => tableConfig.update ?? defaultResponse);
    });

    chain.upsert = vi.fn((...args: unknown[]) => {
      calls.push({ table, operation: "upsert", args });
      return createChain(() => tableConfig.upsert ?? defaultResponse);
    });

    chain.delete = vi.fn(() => {
      calls.push({ table, operation: "delete", args: [] });
      const deleteResp = tableConfig.delete ?? { data: null, error: null };
      const deleteChain = createChain(() => deleteResp);
      deleteChain.then = (fn: (v: SupabaseResponse) => unknown) => Promise.resolve(deleteResp).then(fn);
      deleteChain.catch = (fn: (e: unknown) => unknown) => Promise.resolve(deleteResp).catch(fn);
      return deleteChain;
    });

    chain.select = vi.fn((...args: unknown[]) => {
      calls.push({ table, operation: "select", args });
      return createChain(() => tableConfig.select ?? defaultResponse);
    });

    return chain;
  });

  const auth = {
    getUser: vi.fn(async (_token?: string) => {
      return authConfig.getUser ?? { data: { user: null }, error: { message: "Invalid token" } };
    }),
  };

  return {
    // Single centralized cast — mock structurally satisfies SupabaseClient's
    // .from() and .auth.getUser() which are the only APIs used in production code
    client: { from, auth } as unknown as SupabaseClient,
    from,
    auth,
    calls,
  };
}

export type MockSupabase = ReturnType<typeof createMockSupabase>;
