import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // pnpm virtual store requires explicit root for module resolution
    root: __dirname,
  },
};

export default nextConfig;
