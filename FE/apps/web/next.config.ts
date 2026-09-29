import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @repo/core ships TypeScript source. Turbopack transpiles workspace packages
  // on its own; listing it keeps a webpack build (`next build --webpack`) working too.
  transpilePackages: ["@repo/core"],
};

export default nextConfig;
