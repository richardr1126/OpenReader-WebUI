import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      canvas: '@napi-rs/canvas',
    },
  },
  serverExternalPackages: ["@napi-rs/canvas", "better-sqlite3", "ffmpeg-static"],
  outputFileTracingIncludes: {
    '/api/audiobook': [
      './node_modules/ffmpeg-static/ffmpeg',
    ],
    '/api/audiobook/chapter': [
      './node_modules/ffmpeg-static/ffmpeg',
    ],
    '/api/whisper': [
      './node_modules/ffmpeg-static/ffmpeg',
    ],
  },
};

export default nextConfig;
