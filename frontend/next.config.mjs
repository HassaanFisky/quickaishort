/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "https://quickai-api-y2cgnbsbxa-uc.a.run.app",
  },
  async headers() {
    const isolationHeaders = [
      { key: "Cross-Origin-Opener-Policy",  value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
    ];
    return [
      // SharedArrayBuffer required paths (Whisper.wasm, FFmpeg.wasm, OPFS)
      { source: "/editor/:path*", headers: isolationHeaders },
      { source: "/adk/:path*",    headers: isolationHeaders },
    ];
  },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverComponentsExternalPackages: ["@xenova/transformers", "onnxruntime-node"],
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    // Ignore native Node addons (.node binaries) — they run server-side only
    config.module.rules.push({
      test: /\.node$/,
      use: "ignore-loader",
    });
    return config;
  },
};

export default nextConfig;
