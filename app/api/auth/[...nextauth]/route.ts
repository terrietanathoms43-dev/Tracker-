import { handlers } from "@/lib/auth";

// Auth.js owns everything under /api/auth: sign-in, callbacks, sign-out, the session endpoint.
export const { GET, POST } = handlers;
