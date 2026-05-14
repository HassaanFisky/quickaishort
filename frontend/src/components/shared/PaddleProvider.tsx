"use client";

import Script from "next/script";
import { useEffect } from "react";

const PADDLE_CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";

export function PaddleProvider() {
  useEffect(() => {
    // Re-initialize if Paddle was already loaded (e.g. hot reload in dev)
    if (typeof window !== "undefined" && window.Paddle && PADDLE_CLIENT_TOKEN) {
      window.Paddle.Initialize({ token: PADDLE_CLIENT_TOKEN });
    }
  }, []);

  return (
    <Script
      src="https://cdn.paddle.com/paddle/v2/paddle.js"
      strategy="afterInteractive"
      onLoad={() => {
        if (window.Paddle && PADDLE_CLIENT_TOKEN) {
          window.Paddle.Initialize({ token: PADDLE_CLIENT_TOKEN });
        }
      }}
    />
  );
}
