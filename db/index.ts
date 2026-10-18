import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// One connection pool per process. In development the module re-evaluates on every edit, so the pool is
// kept on globalThis instead of leaking a new set of connections each time (bump the key if options change).
const globalForDb = globalThis as unknown as { trackwisePoolV1?: Pool };

const pool =
  globalForDb.trackwisePoolV1 ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // One long-lived process under pm2, so a normal pool; keep it small if the database is ever remote and pooled.
    max: 10,
    // The database is remote: a dropped connection must fail fast, not hang every request behind it.
    keepAlive: true,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 20_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.trackwisePoolV1 = pool;

export const db = drizzle(pool, { schema });

export type Db = typeof db;
/** The handle a transaction callback receives; DAL helpers accept either `db` or a `tx`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
