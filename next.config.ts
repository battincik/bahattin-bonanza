import type { NextConfig } from "next";
import JavaScriptObfuscator from "webpack-obfuscator";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.plugins.push(
        new JavaScriptObfuscator(
          {
            compact: true,
            controlFlowFlattening: true,
            controlFlowFlatteningThreshold: 1, // tüm kodu karıştırır
            deadCodeInjection: true,
            deadCodeInjectionThreshold: 1, // %100 sahte kod
            stringArray: true,
            rotateStringArray: true,
            stringArrayEncoding: ["rc4"], // base64 yerine RC4 ile şifreler
            stringArrayThreshold: 1, // tüm stringler obfuscate
            disableConsoleOutput: true, // console.log’ları kaldır
            identifierNamesGenerator: "mangled-shuffled", // değişken isimleri karışık
            numbersToExpressions: true, // sayıları karmaşık matematiksel ifadeler yapar
            splitStrings: true,
            splitStringsChunkLength: 5, // stringleri parçalara böler
            transformObjectKeys: true, // obje anahtarlarını da şifreler
            unicodeEscapeSequence: true, // unicode karakterleri \x ile yazar
          },
          []
        )
      );
    }
    return config;
  },
};

export default nextConfig;
