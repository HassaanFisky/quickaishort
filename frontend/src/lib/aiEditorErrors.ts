/**
 * Typed AI Editor failure mapping — hard quota ≠ transient busy.
 * Mirrors FastAPI stream/HTTP error envelope (`kind`, `retry_after`).
 */

export type AiEditorErrorKind =
  | "hard_quota"
  | "transient"
  | "credits"
  | "credit_service"
  | "unauthorized"
  | "forbidden"
  | "invalid_output"
  | "unavailable"
  | "network"
  | "unknown";

export interface AiEditorErrorInfo {
  kind: AiEditorErrorKind;
  message: string;
  status?: number;
  retryAfterSeconds?: number;
}

const HARD_QUOTA_MSG =
  "AI is temporarily unavailable (provider limit). Your timeline edits are safe — try again after the provider restores access.";
const TRANSIENT_MSG =
  "AI is briefly rate-limited. Your edits stay on the timeline — try again shortly.";
const CREDITS_MSG =
  "You're out of credits. Upgrade to Pro to keep editing with AI.";
const CREDIT_SERVICE_MSG =
  "Billing check is briefly unavailable. Try again in a moment.";

function coerceKind(raw: unknown): AiEditorErrorKind | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim().toLowerCase();
  if (
    k === "hard_quota" ||
    k === "transient" ||
    k === "credits" ||
    k === "credit_service" ||
    k === "unauthorized" ||
    k === "forbidden" ||
    k === "invalid_output" ||
    k === "unavailable" ||
    k === "network" ||
    k === "unknown"
  ) {
    return k;
  }
  if (k === "transient_rate_limit") return "transient";
  return null;
}

/** Parse FastAPI detail string | object into structured fields. */
export function parseFastApiDetail(body: unknown): {
  detailText: string;
  kind?: AiEditorErrorKind;
  retryAfterSeconds?: number;
} {
  if (!body || typeof body !== "object") {
    return { detailText: "" };
  }
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") {
    return { detailText: detail };
  }
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    const kind = coerceKind(d.kind);
    const message =
      typeof d.message === "string"
        ? d.message
        : typeof d.detail === "string"
          ? d.detail
          : "";
    const retry =
      typeof d.retry_after === "number"
        ? d.retry_after
        : typeof d.retry_after_seconds === "number"
          ? d.retry_after_seconds
          : undefined;
    return {
      detailText: message || JSON.stringify(detail),
      kind: kind ?? undefined,
      retryAfterSeconds: retry,
    };
  }
  return { detailText: "" };
}

export function mapAiEditorError(input: {
  status?: number;
  message?: string;
  detail?: string;
  kind?: AiEditorErrorKind | string | null;
  retryAfterSeconds?: number;
  body?: unknown;
}): AiEditorErrorInfo {
  const parsed = parseFastApiDetail(input.body);
  const detail = input.detail || parsed.detailText || "";
  const errMsg = input.message || "";
  const blob = `${errMsg} ${detail}`;
  const status = input.status;
  const kindFromWire =
    coerceKind(input.kind) ?? parsed.kind ?? null;
  const retryAfterSeconds =
    input.retryAfterSeconds ?? parsed.retryAfterSeconds;

  if (
    kindFromWire === "credits" ||
    status === 402 ||
    /insufficient credits|402/i.test(blob)
  ) {
    return {
      kind: "credits",
      message: detail || CREDITS_MSG,
      status: status ?? 402,
    };
  }

  if (
    kindFromWire === "credit_service" ||
    status === 503 ||
    /credit service unavailable/i.test(blob)
  ) {
    return {
      kind: "credit_service",
      message: detail || CREDIT_SERVICE_MSG,
      status: status ?? 503,
      retryAfterSeconds,
    };
  }

  if (
    kindFromWire === "unauthorized" ||
    status === 401 ||
    /\(401\)|unauthorized|invalid or expired token|missing authorization/i.test(
      blob,
    )
  ) {
    return {
      kind: "unauthorized",
      message: "Sign in to continue — your timeline is still here.",
      status: status ?? 401,
    };
  }

  if (
    kindFromWire === "forbidden" ||
    status === 403 ||
    /\(403\)|forbidden|permission/i.test(blob)
  ) {
    return {
      kind: "forbidden",
      message: detail || "This action isn't available on your plan.",
      status: status ?? 403,
    };
  }

  if (kindFromWire === "hard_quota") {
    return {
      kind: "hard_quota",
      message: detail || HARD_QUOTA_MSG,
      status: status ?? 429,
      retryAfterSeconds,
    };
  }

  if (kindFromWire === "transient") {
    const suffix =
      retryAfterSeconds && retryAfterSeconds > 0
        ? ` Retry in about ${retryAfterSeconds}s.`
        : "";
    return {
      kind: "transient",
      message: (detail || TRANSIENT_MSG) + suffix,
      status: status ?? 429,
      retryAfterSeconds,
    };
  }

  if (
    status === 429 ||
    /rate.?limit|quota|429|RESOURCE_EXHAUSTED|prepayment|credits? depleted|hard.?quota/i.test(
      blob,
    )
  ) {
    const isHard =
      /quota is exhausted|hard.?quota|prepayment|credits? depleted|RESOURCE_EXHAUSTED/i.test(
        blob,
      );
    if (isHard) {
      return {
        kind: "hard_quota",
        message: detail || HARD_QUOTA_MSG,
        status: 429,
        retryAfterSeconds,
      };
    }
    const suffix =
      retryAfterSeconds && retryAfterSeconds > 0
        ? ` Retry in about ${retryAfterSeconds}s.`
        : "";
    return {
      kind: "transient",
      message: (detail || TRANSIENT_MSG) + suffix,
      status: 429,
      retryAfterSeconds,
    };
  }

  if (/api[_\s]?key|not configured/i.test(blob)) {
    return {
      kind: "unavailable",
      message: "AI editing isn't available right now. Try again later.",
      status,
    };
  }

  if (/network|fetch|failed to fetch/i.test(errMsg)) {
    return {
      kind: "network",
      message: "Connection lost — check your internet and retry.",
      status,
    };
  }

  if (kindFromWire === "invalid_output" || /400|invalid argument/i.test(errMsg)) {
    return {
      kind: "invalid_output",
      message: "Couldn't understand that — try rephrasing.",
      status: status ?? 400,
    };
  }

  return {
    kind: kindFromWire ?? "unknown",
    message:
      detail ||
      (errMsg && errMsg !== "Request failed"
        ? errMsg
        : "Couldn't complete that — try again."),
    status,
    retryAfterSeconds,
  };
}
