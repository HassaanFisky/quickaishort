// @ts-nocheck — OPFS FileSystemWritableFileStream types not fully resolved in TS 5.9.3
"use client";

/**
 * OPFS (Origin Private File System) helper for caching decoded media segments.
 * Falls back gracefully when OPFS is unavailable (Safari < 15.2, non-secure contexts).
 */

const OPFS_DIR = "quickeditor_cache";

function isOpfsAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "storage" in navigator &&
    typeof (navigator.storage as { getDirectory?: unknown }).getDirectory === "function"
  );
}

async function getRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (!isOpfsAvailable()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(OPFS_DIR, { create: true });
  } catch {
    return null;
  }
}

/** Write a Uint8Array to OPFS under `filename`. No-ops if OPFS unavailable. */
export async function opfsWrite(filename: string, data: Uint8Array): Promise<void> {
  const dir = await getRoot();
  if (!dir) return;
  try {
    const fh = await dir.getFileHandle(filename, { create: true });
    const writable = await (fh as FileSystemFileHandle & {
      createWritable: () => Promise<FileSystemWritableFileStream>;
    }).createWritable();
    await writable.write(data);
    await writable.close();
  } catch {
    // OPFS write failure is non-fatal — caller falls back to in-memory
  }
}

/** Read a file from OPFS. Returns null if missing or OPFS unavailable. */
export async function opfsRead(filename: string): Promise<Uint8Array | null> {
  const dir = await getRoot();
  if (!dir) return null;
  try {
    const fh = await dir.getFileHandle(filename);
    const file = await fh.getFile();
    const buf = await file.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

/** Delete a cached file. No-ops if missing. */
export async function opfsDelete(filename: string): Promise<void> {
  const dir = await getRoot();
  if (!dir) return;
  try {
    await dir.removeEntry(filename);
  } catch {
    // ignore
  }
}

/** List cached file names. */
export async function opfsList(): Promise<string[]> {
  const dir = await getRoot();
  if (!dir) return [];
  const names: string[] = [];
  try {
    for await (const [name] of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
      names.push(name);
    }
  } catch {
    // ignore
  }
  return names;
}

/** Clear all cached files in the OPFS directory. */
export async function opfsClear(): Promise<void> {
  const names = await opfsList();
  await Promise.all(names.map(opfsDelete));
}
