import { defineConfig } from "drizzle-kit";

const localDbUrl = "postgresql://swag:swag@127.0.0.1:5433/swag";
const dbUrl =
  process.env.DATABASE_URL ||
  (process.env.NODE_ENV === "production" ? process.env.POSTGRES_URL : undefined) ||
  localDbUrl;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
