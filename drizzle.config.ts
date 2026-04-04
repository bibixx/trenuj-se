import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".dev.vars" });

if (!process.env["DATABASE_URL"]) {
  throw new Error("DATABASE_URL is required to run Drizzle commands. Set it in the environment or in .dev.vars");
}

export default defineConfig({
  out: "./db/migrations",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"],
  },
});
