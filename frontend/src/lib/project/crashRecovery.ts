"use client";

import { idbSave, idbLoad, idbDelete } from "./idbStorage";
import { exportQep, importQep } from "./qepSerializer";
import type { QepProject } from "./qepTypes";

const DRAFT_KEY = "quickeditor:draft";
const DEBOUNCE_MS = 5_000;

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced autosave — called on every store mutation that should persist.
 * snapshot must be the serializable portion of the store state.
 */
export function autosave(snapshot: Parameters<typeof exportQep>[0]): void {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    const json = exportQep(snapshot);
    idbSave(DRAFT_KEY, json).catch(() => {
      // Silent — autosave is best-effort
    });
  }, DEBOUNCE_MS);
}

/** Load the last autosaved draft. Returns null when none exists. */
export async function recoverDraft(): Promise<QepProject | null> {
  const raw = await idbLoad<string>(DRAFT_KEY);
  if (!raw) return null;
  try {
    return importQep(raw);
  } catch {
    await idbDelete(DRAFT_KEY);
    return null;
  }
}

/** Remove the draft after a clean save or deliberate discard. */
export async function clearDraft(): Promise<void> {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
  await idbDelete(DRAFT_KEY);
}
