import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      canvas: './empty-module.ts',
    },
  },
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
