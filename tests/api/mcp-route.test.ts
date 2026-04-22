import { describe, expect, test } from "vitest";
import app from "../../server/index.ts";
import { MOCK_ENV } from "../helpers/mock-env.ts";

describe("MCP route registration", () => {
  test("POST /mcp returns auth error when unauthenticated", async () => {
    const res = await app.request("/mcp", { method: "POST" }, MOCK_ENV);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      code: "AUTH_ERROR",
      message: "Invalid or missing access token",
    });
  });

  test("POST /mcp/ returns the same auth error when unauthenticated", async () => {
    const res = await app.request("/mcp/", { method: "POST" }, MOCK_ENV);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      code: "AUTH_ERROR",
      message: "Invalid or missing access token",
    });
  });
});
