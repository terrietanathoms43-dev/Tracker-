import type { NextConfig } from "next";

// Cache Components + partial prefetching: the static shell prerenders and every session-dependent
// part streams inside its own <Suspense> (see app/(app)/layout.tsx and docs/PLAN.md §0).
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
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
