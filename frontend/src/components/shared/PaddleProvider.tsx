"use client";

import Script from "next/script";
import { useEffect } from "react";

const PADDLE_CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";

/**
 * Global Paddle event callback.
 *
 * Paddle's `eventCallback` is registered on `Paddle.Initialize` and applies
 * to every checkout opened through `Paddle.Checkout.open`. We rebroadcast
 * relevant events as window CustomEvents so feature surfaces (pricing page,
 * paywall flows, etc.) can subscribe without coupling to Paddle internals.
 *
 * Events dispatched:
 *  - "paddle:checkout-completed"  — fires when a payment succeeds.
 *  - "paddle:checkout-closed"     — fires when the user dismisses the overlay.
 *  - "paddle:checkout-error"      — fires when checkout encounters an error.
 *
 * Each event's `detail` is the raw Paddle event payload.
 */
function paddleEventCallback(event: { name: string; data: Record<string, unknown> }) {
  if (typeof window === "undefined") return;

  switch (event.name) {
    case "checkout.completed":
      window.dispatchEvent(
        new CustomEvent("paddle:checkout-completed", { detail: event.data }),
      );
      break;
    case "checkout.closed":
      window.dispatchEvent(
        new CustomEvent("paddle:checkout-closed", { detail: event.data }),
      );
      break;
    case "checkout.error":
      window.dispatchEvent(
        new CustomEvent("paddle:checkout-error", { detail: event.data }),
      );
      break;
    default:
      // Other Paddle events (checkout.loaded, checkout.payment.selected, etc.)
      // are not currently consumed; pass-through bridging can be added here.
      break;
  }
}

function initializePaddle() {
  if (typeof window === "undefined" || !window.Paddle || !PADDLE_CLIENT_TOKEN) return;
  window.Paddle.Initialize({
    token: PADDLE_CLIENT_TOKEN,
    eventCallback: paddleEventCallback,
  });
}

export function PaddleProvider() {
  useEffect(() => {
    // Re-initialize if Paddle was already loaded (e.g. hot reload in dev).
    initializePaddle();
  }, []);

  return (
    <Script
      src="https://cdn.paddle.com/paddle/v2/paddle.js"
      strategy="afterInteractive"
      onLoad={initializePaddle}
    />
  );
}
