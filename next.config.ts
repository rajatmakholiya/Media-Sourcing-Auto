import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Standalone output — produces a self-contained server.js
  // Required for Docker/Render deployment
  output: "standalone",

  // Remotion and render script run outside Next.js bundler
  serverExternalPackages: [
    "@remotion/renderer",
    "@remotion/bundler",
    "@remotion/cli",
    "remotion",
  ],

  // Allow images from stock media sources
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "videos.pexels.com" },
      { protocol: "https", hostname: "pixabay.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
};

export default nextConfig;
