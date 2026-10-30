import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// CSP without nonces: a nonce needs fully dynamic rendering, which cacheComponents + partial prerendering
// rules out (the static shell's scripts can't carry it). 'unsafe-inline' is therefore required for the
// prerendered inline scripts and styles; it stays off scripts entirely in every other way worth having.
// img-src allows https anywhere because avatars come from the sign-in provider (e.g. Google).
const contentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https:;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  ${isDev ? "" : "upgrade-insecure-requests;"}
`
  .replace(/\s{2,}/g, " ")
  .trim();

// Cache Components + partial prefetching: the static shell prerenders and every session-dependent
// part streams inside its own <Suspense> (see app/(app)/layout.tsx and docs/PLAN.md §0).
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  // The Team dashboard became the Members page (docs/PLAN.md, 2026-10-18 log); old links still land somewhere.
  async redirects() {
    return [{ source: "/team", destination: "/members", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
