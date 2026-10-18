import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Better Auth owns everything under /api/auth: the magic-link endpoints, the Google callback, sign-out, the session.
export const { GET, POST } = toNextJsHandler(auth);
