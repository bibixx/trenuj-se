import { describe, test, expect } from "vitest";
import app from "../../server/index.ts";
import { MOCK_ENV } from "../helpers/mock-env.ts";

describe("GET /api/health", () => {
  test("returns 200 with { ok: true }", async () => {
    const res = await app.request("/api/health", {}, MOCK_ENV);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});
