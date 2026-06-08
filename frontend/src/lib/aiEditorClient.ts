/**
 * Typed API client for POST /api/ai-edit (FastAPI Pillar-2 endpoint).
 *
 * Proxied through Next.js /api/ai/editor/route.ts which attaches the
 * NextAuth JWT. This module is the network boundary — no React deps.
 */

import type { AiEditorRequest, AiEditorResponse } from "@/types/ai-editor";

// ─── Error taxonomy ───────────────────────────────────────────────────────────

export class AiEditorError extends Error {
  constructor(message: string, public readonly status: number | null, public readonly body: unknown) {
    super(message);
    this.name = "AiEditorError";
  }
}

export class AiEditorAbortedError        extends AiEditorError { constructor() { super("Request aborted", null, null); this.name = "AiEditorAbortedError"; } }
export class AiEditorTimeoutError        extends AiEditorError { constructor() { super("Request timed out", null, null); this.name = "AiEditorTimeoutError"; } }
export class AiEditorNetworkError        extends AiEditorError { constructor(cause?: unknown) { super("Network failure", null, null); this.name = "AiEditorNetworkError"; this.cause = cause; } }
export class AiEditorAuthError           extends AiEditorError { constructor(body: unknown) { super("Unauthorized", 401, body); this.name = "AiEditorAuthError"; } }
export class AiEditorRateLimitError      extends AiEditorError { constructor(body: unknown) { super("Rate limited", 429, body); this.name = "AiEditorRateLimitError"; } }
export class AiEditorPaymentRequiredError extends AiEditorError { constructor(body: unknown) { super("Credits exhausted", 402, body); this.name = "AiEditorPaymentRequiredError"; } }
export class AiEditorServerError         extends AiEditorError { constructor(status: number, body: unknown) { super(`Server error ${status}`, status, body); this.name = "AiEditorServerError"; } }
export class AiEditorBadResponseError    extends AiEditorError { constructor(body: unknown) { super("Invalid response envelope", 200, body); this.name = "AiEditorBadResponseError"; } }

// ─── Shape validation (no zod — minimal runtime check) ───────────────────────

function validateEnvelope(data: unknown): AiEditorResponse {
  if (!data || typeof data !== "object") throw new AiEditorBadResponseError(data);
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.actions)) throw new AiEditorBadResponseError(data);
  for (const a of d.actions) {
    if (!a || typeof (a as Record<string, unknown>).type !== "string") throw new AiEditorBadResponseError(data);
  }
  const validStatuses = ["ok", "clarification_needed", "no_op", "mocked"];
  if (!validStatuses.includes(d.status as string)) throw new AiEditorBadResponseError(data);
  return data as AiEditorResponse;
}

// ─── Client ───────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 30_000;

export async function callAiEditor(
  req: AiEditorRequest,
  opts?: { signal?: AbortSignal; idempotencyKey?: string },
): Promise<AiEditorResponse> {
  // Chain caller's signal with our internal timeout
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort("timeout"), TIMEOUT_MS);

  const combined = opts?.signal
    ? _combineSignals(opts.signal, timeoutCtrl.signal)
    : timeoutCtrl.signal;

  let body: unknown;
  let status = 0;

  try {
    const res = await fetch("/api/ai/editor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts?.idempotencyKey ? { "X-Idempotency-Key": opts.idempotencyKey } : {}),
      },
      body: JSON.stringify(req),
      signal: combined,
    });

    status = res.status;

    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (status === 401) throw new AiEditorAuthError(body);
    if (status === 402) throw new AiEditorPaymentRequiredError(body);
    if (status === 429) throw new AiEditorRateLimitError(body);
    if (status >= 500)  throw new AiEditorServerError(status, body);
    if (!res.ok)        throw new AiEditorServerError(status, body);

    return validateEnvelope(body);

  } catch (err) {
    if (err instanceof AiEditorError) throw err;

    if (err instanceof DOMException || (err instanceof Error && err.name === "AbortError")) {
      // Distinguish user-abort vs our timeout
      if (timeoutCtrl.signal.aborted && (err as Error).message !== "timeout" && opts?.signal?.aborted !== true) {
        throw new AiEditorTimeoutError();
      }
      throw new AiEditorAbortedError();
    }

    throw new AiEditorNetworkError(err);
  } finally {
    clearTimeout(timer);
  }
}

// Combine two AbortSignals — aborts when either fires
function _combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  if (a.aborted || b.aborted) { ctrl.abort(); return ctrl.signal; }
  a.addEventListener("abort", abort, { once: true });
  b.addEventListener("abort", abort, { once: true });
  return ctrl.signal;
}
