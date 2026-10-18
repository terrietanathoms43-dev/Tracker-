import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

// The schema is applied with `npm run db:push` (no migrations folder) — docs/PLAN.md §0.
// A managed database behind a pooler (Neon) needs its direct URL for schema changes; the app keeps the pooled one.
export default defineConfig({
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL!,
  },
  verbose: true,
});
