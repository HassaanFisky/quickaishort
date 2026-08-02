import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "https://quickai-api-y2cgnbsbxa-uc.a.run.app",
  },
  async redirects() {
    // EP-008 ADK correction: invalid Ads surface → ADK Coming Soon workspace
    return [{ source: "/ads", destination: "/adk", permanent: true }];
  },
  async headers() {
    // Global lockdown — report-only CSP first (enforce after console is clean).
    // HSTS is harmless on localhost HTTP (browsers ignore); enforced on HTTPS.
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)",
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      {
        key: "Content-Security-Policy-Report-Only",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://*.sentry.io",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data:",
          "media-src 'self' blob: https: mediastream:",
          "connect-src 'self' https: wss: blob:",
          "worker-src 'self' blob:",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
        ].join("; "),
      },
    ];
    const isolationHeaders = [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
    ];
    return [
      { source: "/:path*", headers: securityHeaders },
      // SharedArrayBuffer required paths (Whisper.wasm, OPFS decode)
      { source: "/editor/:path*", headers: [...securityHeaders, ...isolationHeaders] },
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
