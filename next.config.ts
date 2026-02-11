import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      canvas: './empty-module.ts',
    },
  },
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: {
    '/api/audiobook(.*)': [
      'node_modules/ffmpeg-static/ffmpeg',
      'node_modules/ffprobe-static/bin/linux/*/ffprobe',
      'node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg',
      'node_modules/.pnpm/ffprobe-static@*/node_modules/ffprobe-static/bin/linux/*/ffprobe',
    ],
    '/api/whisper': [
      'node_modules/ffmpeg-static/ffmpeg',
      'node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg',
    ],
  },
};

export default nextConfig;
