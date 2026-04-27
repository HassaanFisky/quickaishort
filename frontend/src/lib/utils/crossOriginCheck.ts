/**
 * Checks if the current environment is cross-origin isolated.
 * This is required for SharedArrayBuffer to work, which FFmpeg.wasm depends on for multi-threading.
 */
export function checkCrossOriginIsolation(): boolean {
  if (typeof window === "undefined") return false;
  return window.crossOriginIsolated === true;
}

/**
 * Checks if SharedArrayBuffer is available and can be instantiated.
 */
export function checkSharedArrayBuffer(): boolean {
  if (typeof SharedArrayBuffer === "undefined") return false;
  try {
    // Attempt to create a small buffer to verify it's truly available
    new SharedArrayBuffer(1);
    return true;
  } catch {
    return false;
  }
}

/**
 * Hook-friendly version of the check
 */
export function getIsolationStatus() {
  const isIsolated = checkCrossOriginIsolation();
  const hasSAB = checkSharedArrayBuffer();

  return {
    isIsolated,
    hasSAB,
    isReady: isIsolated && hasSAB,
  };
}
