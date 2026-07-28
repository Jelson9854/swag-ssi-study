import { defineConfig } from "drizzle-kit";

const localDbUrl = "postgresql://swag:swag@127.0.0.1:5433/swag";
// Migrations need a direct (non-pooled) connection: drizzle-kit's migration
// locking hangs indefinitely over PgBouncer transaction-mode pooling (Neon's
// pooled "-pooler" host). DIRECT_DATABASE_URL should be Neon's unpooled
// connection string; the app itself keeps using the pooled DATABASE_URL/
// POSTGRES_URL at runtime.
const dbUrl =
  process.env.DIRECT_DATABASE_URL ||
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
