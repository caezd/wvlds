import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  turbopack: {
    // pnpm virtual store requires explicit root for module resolution
    root: __dirname,
  },
};

export default withNextIntl(nextConfig);
