import type { BRollClip } from "@/types/ai-editor";

const TIMEOUT_MS = 10_000;

export class BRollSearchError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = "BRollSearchError";
  }
}

export async function searchBRoll(
  query: string,
  perPage = 12,
): Promise<BRollClip[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `/api/broll/search?q=${encodeURIComponent(q)}&per_page=${perPage}`,
      { method: "GET", signal: ctrl.signal },
    );
    if (!res.ok) {
      throw new BRollSearchError(`Search failed: HTTP ${res.status}`, res.status);
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new BRollSearchError("Invalid response shape", null);
    }
    return data as BRollClip[];
  } catch (err) {
    if (err instanceof BRollSearchError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new BRollSearchError("Search timed out", null);
    }
    throw new BRollSearchError("Network error", null);
  } finally {
    clearTimeout(timer);
  }
}
