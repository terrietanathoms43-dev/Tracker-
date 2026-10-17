import dotenv from "dotenv";

/**
 * Loads environment variables for scripts the way Next.js resolves them: `.env.local` wins over `.env`.
 * Import this FIRST in a script, before anything that reads `process.env` at module load.
 */
dotenv.config({ path: [".env.local", ".env"], quiet: true });
