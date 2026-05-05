import type { NextConfig } from "next";
import path from "path";

// Relative path for Turbopack (no Windows drive letter allowed)
const webBuildRel = "./node_modules/@huggingface/transformers/dist/transformers.web.js";
// Absolute path for webpack (handles Windows paths fine)
const webBuildAbs = path.resolve("node_modules/@huggingface/transformers/dist/transformers.web.js");

const nextConfig: NextConfig = {
  // Turbopack (dev) — plain strings unconditionally override for all contexts (incl. workers)
  turbopack: {
    resolveAlias: {
      "@huggingface/transformers": webBuildRel,
      "sharp": "./src/lib/empty.ts",
      "onnxruntime-node": "./src/lib/empty.ts",
    },
  },
  // Webpack (production build)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@huggingface/transformers": webBuildAbs,
        "sharp$": false,
        "onnxruntime-node$": false,
      };
    } else {
      config.resolve.alias = {
        ...config.resolve.alias,
        "sharp$": false,
        "onnxruntime-node$": false,
      };
    }
    return config;
  },
};

export default nextConfig;
