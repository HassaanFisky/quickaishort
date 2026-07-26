/**
 * Browser→FastAPI fetch with the same auth contract as axios interceptors:
 * attach backendToken, on 401 refresh session once and retry, then signal modal.
 */

import {
  API_URL,
  refreshBackendSession,
  SESSION_EXPIRED_EVENT,
} from "@/lib/api";

export class AuthenticatedFetchError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown = null) {
    super(message);
    this.name = "AuthenticatedFetchError";
    this.status = status;
    this.body = body;
  }
}

function isFastApiUrl(url: string): boolean {
  const apiBase = API_URL.replace(/\/$/, "");
  return url.startsWith(apiBase);
}

/** Build Authorization + X-User-Id from the current NextAuth session. */
export async function buildAuthHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...(extra ?? {}) };

  // Caller already set a refreshed token (retry path) — do not overwrite with stale getSession.
  if (headers["Authorization"]) return headers;

  if (typeof window === "undefined") return headers;

  try {
    const { getSession } = await import("next-auth/react");
    const session = await getSession();
    if (session?.backendToken) {
      headers["Authorization"] = `Bearer ${session.backendToken}`;
    }
    if (session?.user?.id) {
      headers["X-User-Id"] = session.user.id;
    }
  } catch {
    // Continue without auth — FastAPI will 401 if required
  }

  return headers;
}

function signalSessionExpired(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }
}

/**
 * fetch() wrapper for FastAPI URLs: one silent session refresh on 401, then modal.
 * Non-FastAPI URLs pass through without auth retry logic.
 */
export async function authenticatedFetch(
  input: string,
  init?: RequestInit,
  opts?: { authRetried?: boolean },
): Promise<Response> {
  const authRetried = opts?.authRetried ?? false;
  const baseHeaders: Record<string, string> =
    init?.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : Array.isArray(init?.headers)
        ? Object.fromEntries(init.headers)
        : { ...((init?.headers as Record<string, string> | undefined) ?? {}) };

  const headers = await buildAuthHeaders(baseHeaders);

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status !== 401 || !isFastApiUrl(input)) {
    return response;
  }

  if (!authRetried) {
    const refreshed = await refreshBackendSession();
    if (refreshed?.backendToken) {
      const retryHeaders: Record<string, string> = {
        ...headers,
        Authorization: `Bearer ${refreshed.backendToken}`,
      };
      if (refreshed.userId) {
        retryHeaders["X-User-Id"] = refreshed.userId;
      }
      return authenticatedFetch(
        input,
        { ...init, headers: retryHeaders },
        { authRetried: true },
      );
    }
  }

  signalSessionExpired();
  return response;
}

/**
 * Parse a non-OK FastAPI JSON error into AuthenticatedFetchError.
 * Call after authenticatedFetch when !response.ok.
 * (401 modal is already signaled by authenticatedFetch on exhausted retry.)
 */
/** Extract a human-readable message from FastAPI `detail` (string | object | list). */
export function formatApiDetail(detail: unknown, status: number): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return null;
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  if (detail && typeof detail === "object") {
    const obj = detail as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message.trim()) return obj.message;
    if (typeof obj.detail === "string" && obj.detail.trim()) return obj.detail;
    if (typeof obj.error === "string" && obj.error.trim()) return obj.error;
  }
  return `Request failed: ${status}`;
}

export async function throwIfNotOk(response: Response): Promise<void> {
  if (response.ok) return;

  const error = await response.json().catch(() => ({}));
  const detail = formatApiDetail(
    (error as { detail?: unknown }).detail ?? error,
    response.status,
  );

  throw new AuthenticatedFetchError(
    `${detail} (${response.status})`,
    response.status,
    error,
  );
}
