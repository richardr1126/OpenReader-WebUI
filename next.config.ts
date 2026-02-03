import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      canvas: './empty-module.ts',
    },
  },
  experimental: {
    middlewareClientMaxBodySize: '100mb',
  },
};

export default nextConfig;
