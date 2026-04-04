import { describe, test, expect, afterEach } from "vitest";
import app from "../../server/index.ts";
import { MOCK_ENV, MOCK_USER_ID, MOCK_TOKEN_ID } from "../helpers/mock-env.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { setMockSupabase, clearMockSupabase } from "../helpers/setup.ts";

const VALID_AUTH = { headers: { Authorization: "Bearer valid-jwt" } };

const MOCK_TOKEN_RECORDS = [
  {
    id: MOCK_TOKEN_ID,
    name: "My MCP Token",
    last_used_at: null,
    created_at: "2024-01-01T00:00:00Z",
  },
];

type TableConfig = Parameters<typeof createMockSupabase>[0]["tables"];

function mockWithAuth(tables: TableConfig = {}) {
  return createMockSupabase({
    auth: {
      getUser: { data: { user: { id: MOCK_USER_ID } }, error: null },
    },
    tables,
  });
}

describe("/api/tokens — auth middleware", () => {
  afterEach(() => clearMockSupabase());

  test("401 when no Authorization header", async () => {
    const mock = createMockSupabase({
      auth: { getUser: { data: { user: null }, error: { message: "No token" } } },
    });
    setMockSupabase(mock);

    const res = await app.request("/api/tokens", {}, MOCK_ENV);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_ERROR");
    expect(body.message).toMatch(/missing bearer token/i);
  });

  test("401 when Authorization header is not Bearer", async () => {
    const mock = createMockSupabase({
      auth: { getUser: { data: { user: null }, error: { message: "No token" } } },
    });
    setMockSupabase(mock);

    const res = await app.request("/api/tokens", { headers: { Authorization: "Basic abc" } }, MOCK_ENV);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_ERROR");
  });

  test("401 when JWT is invalid (supabase returns error)", async () => {
    const mock = createMockSupabase({
      auth: {
        getUser: { data: { user: null }, error: { message: "JWT expired" } },
      },
    });
    setMockSupabase(mock);

    const res = await app.request("/api/tokens", VALID_AUTH, MOCK_ENV);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_ERROR");
    expect(body.message).toMatch(/invalid or expired/i);
  });
});

describe("GET /api/tokens", () => {
  afterEach(() => clearMockSupabase());

  test("200 returns list of tokens", async () => {
    const mock = mockWithAuth({
      api_tokens: {
        select: { data: MOCK_TOKEN_RECORDS, error: null },
      },
    });
    setMockSupabase(mock);

    const res = await app.request("/api/tokens", VALID_AUTH, MOCK_ENV);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokens).toEqual(MOCK_TOKEN_RECORDS);
  });

  test("200 returns empty array when no tokens exist", async () => {
    const mock = mockWithAuth({
      api_tokens: {
        select: { data: [], error: null },
      },
    });
    setMockSupabase(mock);

    const res = await app.request("/api/tokens", VALID_AUTH, MOCK_ENV);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokens).toEqual([]);
  });

  test("500 when supabase returns error on list", async () => {
    const mock = mockWithAuth({
      api_tokens: {
        select: { data: null, error: { message: "Database connection lost" } },
      },
    });
    setMockSupabase(mock);

    const res = await app.request("/api/tokens", VALID_AUTH, MOCK_ENV);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.message).toBe("Database connection lost");
  });
});

describe("POST /api/tokens", () => {
  afterEach(() => clearMockSupabase());

  test("201 creates token and returns token + record", async () => {
    const newRecord = {
      id: MOCK_TOKEN_ID,
      name: "CI Token",
      last_used_at: null,
      created_at: "2024-06-01T00:00:00Z",
    };
    const mock = mockWithAuth({
      api_tokens: {
        insert: { data: newRecord, error: null },
        select: { data: newRecord, error: null },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(
      "/api/tokens",
      {
        method: "POST",
        headers: { ...VALID_AUTH.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "CI Token" }),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toMatch(/^tp_[0-9a-f]{64}$/);
    expect(body.record).toEqual(newRecord);
  });

  test("400 when name is missing", async () => {
    const mock = mockWithAuth();
    setMockSupabase(mock);

    const res = await app.request(
      "/api/tokens",
      {
        method: "POST",
        headers: { ...VALID_AUTH.headers, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details).toBeDefined();
  });

  test("400 when name is empty string", async () => {
    const mock = mockWithAuth();
    setMockSupabase(mock);

    const res = await app.request(
      "/api/tokens",
      {
        method: "POST",
        headers: { ...VALID_AUTH.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  test("400 when body is not valid JSON", async () => {
    const mock = mockWithAuth();
    setMockSupabase(mock);

    const res = await app.request(
      "/api/tokens",
      {
        method: "POST",
        headers: { ...VALID_AUTH.headers, "Content-Type": "application/json" },
        body: "not-json",
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  test("400 when name exceeds 100 characters", async () => {
    const mock = mockWithAuth();
    setMockSupabase(mock);

    const res = await app.request(
      "/api/tokens",
      {
        method: "POST",
        headers: { ...VALID_AUTH.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "a".repeat(101) }),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  test("500 when supabase returns error on insert", async () => {
    const mock = mockWithAuth({
      api_tokens: {
        insert: { data: null, error: { message: "Unique constraint violated" } },
        select: { data: null, error: { message: "Unique constraint violated" } },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(
      "/api/tokens",
      {
        method: "POST",
        headers: { ...VALID_AUTH.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Duplicate Token" }),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
  });
});

describe("DELETE /api/tokens/:id", () => {
  afterEach(() => clearMockSupabase());

  test("204 deletes token successfully", async () => {
    const mock = mockWithAuth({
      api_tokens: {
        delete: { data: null, error: null },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(`/api/tokens/${MOCK_TOKEN_ID}`, { method: "DELETE", headers: VALID_AUTH.headers }, MOCK_ENV);

    expect(res.status).toBe(204);
  });

  test("500 when supabase returns error on delete", async () => {
    const mock = mockWithAuth({
      api_tokens: {
        delete: { data: null, error: { message: "Row-level security violation" } },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(`/api/tokens/${MOCK_TOKEN_ID}`, { method: "DELETE", headers: VALID_AUTH.headers }, MOCK_ENV);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.message).toBe("Row-level security violation");
  });

  test("401 when deleting without auth", async () => {
    const mock = createMockSupabase({
      auth: { getUser: { data: { user: null }, error: { message: "No auth" } } },
    });
    setMockSupabase(mock);

    const res = await app.request(`/api/tokens/${MOCK_TOKEN_ID}`, { method: "DELETE" }, MOCK_ENV);

    expect(res.status).toBe(401);
  });
});
