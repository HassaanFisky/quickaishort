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
export async function throwIfNotOk(response: Response): Promise<void> {
  if (response.ok) return;

  const error = await response.json().catch(() => ({}));
  const rawDetail = (error as { detail?: unknown }).detail;
  let detail = `Request failed: ${response.status}`;
  if (typeof rawDetail === "string") {
    detail = rawDetail;
  } else if (rawDetail && typeof rawDetail === "object") {
    const d = rawDetail as { message?: unknown; detail?: unknown };
    if (typeof d.message === "string") detail = d.message;
    else if (typeof d.detail === "string") detail = d.detail;
  }

  throw new AuthenticatedFetchError(
    `${detail} (${response.status})`,
    response.status,
    error,
  );
}
