import { withSentryConfig } from "@sentry/nextjs";

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

// withSentryConfig's webpack plugin can reach out to Sentry's API (telemetry,
// release/org auto-detection) at build time. Without SENTRY_AUTH_TOKEN there
// is nothing for it to authenticate with, so the plugin is skipped entirely
// — guarantees the build never depends on network access until Hassaan
// provisions a real Sentry CI token. Runtime error capture is unaffected;
// it's driven purely by sentry.{client,server,edge}.config.ts at request time.
const hasSentryAuthToken = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default hasSentryAuthToken
  ? withSentryConfig(nextConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      disableLogger: true,
      widenClientFileUpload: false,
      telemetry: false,
      sourcemaps: { disable: true },
    })
  : nextConfig;
