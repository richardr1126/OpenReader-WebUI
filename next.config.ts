import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      canvas: '@napi-rs/canvas',
    },
  },
  serverExternalPackages: ["@napi-rs/canvas", "better-sqlite3", "ffmpeg-static", "ffprobe-static"],
  outputFileTracingIncludes: {
    '/api/audiobook': [
      './node_modules/ffmpeg-static/ffmpeg',
      './node_modules/ffprobe-static/bin/*/*/ffprobe',
    ],
    '/api/audiobook/chapter': [
      './node_modules/ffmpeg-static/ffmpeg',
      './node_modules/ffprobe-static/bin/*/*/ffprobe',
    ],
    '/api/audiobook/status': [
      './node_modules/ffmpeg-static/ffmpeg',
      './node_modules/ffprobe-static/bin/*/*/ffprobe',
    ],
    '/api/whisper': [
      './node_modules/ffmpeg-static/ffmpeg',
    ],
  },
};

export default nextConfig;
