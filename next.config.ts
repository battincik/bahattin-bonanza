import type { NextConfig } from "next";
import JavaScriptObfuscator from "webpack-obfuscator";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.plugins.push(
        new JavaScriptObfuscator(
          {
            rotateStringArray: true,
            stringArray: true,
            stringArrayThreshold: 0.75,
            compact: true,
            controlFlowFlattening: true,
            deadCodeInjection: true,
          },
          []
        )
      );
    }
    return config;
  },
};

export default nextConfig;
