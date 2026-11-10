// Signs a real account in for the agent's browser (AGENTS.md, "Sign in as a real account"). It writes a 12-hour
// session row straight into the chosen database and returns the signed cookie Better Auth reads, for an account the
// owner has listed in AGENT_LOGIN_ACCOUNTS in .env.local. No app route is involved, so it works against any database
// this machine can reach and any branch's server, as long as that server reads the same database and the same
// BETTER_AUTH_SECRET. The test-login route stays what it is: the seeded .test personas, on a dev server.
//
//   import { createAgentSession } from "./scripts/agent-session.mjs"
//   const { cookie, orgId } = await createAgentSession({ email: "you@example.com", db: "prod", org: "apex" })
//
// Databases are named the way scripts/db-copy.ts names them: "local" is DATABASE_URL; any other name is
// <NAME>_DATABASE_URL (its _DIRECT variant first), or DATABASE_URL_<NAME> / DATABASE_URL_DIRECT_<NAME>.
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

export const SESSION_HOURS = 12;
/** Better Auth's session cookie on http (production is https and prefixes it with __Secure-). */
export const SESSION_COOKIE = "better-auth.session_token";
/** The active-workspace cookie (ORG_COOKIE in lib/constants.ts). */
export const ORG_COOKIE = "trackwise.org";

/** The pooled and direct connection strings a database name stands for. Never print them. */
export function databaseUrls(name = "local") {
  if (name === "local" || name === "") {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set in .env.local");
    return { name: "local", pooled: process.env.DATABASE_URL, direct: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL };
  }
  const NAME = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const pooled = process.env[`${NAME}_DATABASE_URL`] || process.env[`DATABASE_URL_${NAME}`];
  const direct = process.env[`${NAME}_DATABASE_URL_DIRECT`] || process.env[`DATABASE_URL_DIRECT_${NAME}`] || pooled;
  if (!pooled) throw new Error(`No connection string for "${name}": set ${NAME}_DATABASE_URL (or DATABASE_URL_${NAME}) in .env.local`);
  return { name, pooled, direct };
}

/** "prod" and "production" are the same database, and the one every guard treats differently. */
export const isProductionName = (name) => /^prod(uction)?$/i.test(name ?? "");

/** host/database of a connection string, for messages: never the user or the password. */
export function describeUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.host.replace(/^ep-[^.]+/, "ep-…")}${parsed.pathname}`;
  } catch {
    return "(unreadable url)";
  }
}

/** The accounts the owner lets the agent sign in as (AGENT_LOGIN_ACCOUNTS: comma-separated emails). */
export function allowedAccounts() {
  return (process.env.AGENT_LOGIN_ACCOUNTS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email !== "");
}

/** The cookie value Better Auth expects: the token, a dot, and a base64 HMAC-SHA256 of the token under the auth secret. */
export function signSessionCookie(token) {
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
  if (secret === "") throw new Error("BETTER_AUTH_SECRET is not set in .env.local");
  return `${token}.${createHmac("sha256", secret).update(token).digest("base64")}`;
}

/**
 * Inserts the session and returns what the browser needs: the signed cookie, when it expires, and the workspace to
 * make active (`org`: a slug; default the account's first workspace by name). Refuses an account that is not listed.
 */
export async function createAgentSession({ email, db = "local", org = null }) {
  const wanted = String(email).trim().toLowerCase();
  if (!allowedAccounts().includes(wanted)) {
    throw new Error(`${wanted} is not in AGENT_LOGIN_ACCOUNTS in .env.local, so the agent may not sign in as it.`);
  }
  const target = databaseUrls(db);
  const pool = new Pool({ connectionString: target.direct });
  try {
    const [user] = (await pool.query("select id, name, email from users where lower(email) = $1", [wanted])).rows;
    if (!user) throw new Error(`No account ${wanted} in the ${target.name} database (${describeUrl(target.direct)}).`);
    const orgs = (
      await pool.query(
        `select o.id, o.slug, o.name, m.role from organization_members m join organizations o on o.id = m.org_id where m.user_id = $1 order by o.name`,
        [user.id],
      )
    ).rows;
    const workspace = org ? orgs.find((row) => row.slug === org) : orgs[0];
    if (!workspace) throw new Error(org ? `${wanted} is not a member of a workspace with the slug "${org}" (has: ${orgs.map((row) => row.slug).join(", ") || "none"}).` : `${wanted} has no workspace.`);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);
    const token = randomBytes(32).toString("base64url");
    await pool.query(
      `insert into sessions (id, token, user_id, expires_at, ip_address, user_agent, created_at, updated_at) values ($1, $2, $3, $4, '', 'agent-login', $5, $5)`,
      [randomUUID(), token, user.id, expiresAt, now],
    );
    return { cookie: signSessionCookie(token), expiresAt, orgId: workspace.id, orgSlug: workspace.slug, role: workspace.role, userId: user.id, userName: user.name, database: `${target.name} (${describeUrl(target.direct)})` };
  } finally {
    await pool.end();
  }
}
