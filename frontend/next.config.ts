import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  },
  images: {
    // Allow any HTTPS domain for avatar photos (stock or uploaded)
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  // Prevent webpack from processing the large Speech SDK on the server side
  serverExternalPackages: ["microsoft-cognitiveservices-speech-sdk"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "microsoft-cognitiveservices-speech-sdk",
      ];
    }
    return config;
  },
};

export default nextConfig;
