// @ts-nocheck — @ffmpeg/ffmpeg uses dynamic imports not typed in TS 5.9.3
"use client";

import { opfsRead, opfsWrite } from "./opfsStorage";

const CDN_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
const LOAD_TIMEOUT_MS = 15_000;

type FFmpegInstance = {
  load: (opts: unknown) => Promise<void>;
  writeFile: (name: string, data: Uint8Array | string) => Promise<void>;
  readFile: (name: string) => Promise<Uint8Array>;
  deleteFile: (name: string) => Promise<void>;
  exec: (args: string[]) => Promise<number>;
  on: (event: string, cb: unknown) => void;
  off: (event: string, cb: unknown) => void;
};

let _instance: FFmpegInstance | null = null;
let _loadPromise: Promise<FFmpegInstance> | null = null;

export interface DecodeProgress {
  ratio: number; // 0–1
}

/** Returns (or lazily creates) the shared FFmpeg.wasm instance. */
async function getFFmpeg(): Promise<FFmpegInstance> {
  if (_instance) return _instance;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { fetchFile, toBlobURL } = await import("@ffmpeg/util");

    const ff = new FFmpeg() as FFmpegInstance;

    const loadTimer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("FFmpeg.wasm load timeout (CDN blocked?)")), LOAD_TIMEOUT_MS)
    );

    await Promise.race([
      ff.load({
        coreURL: await toBlobURL(`${CDN_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CDN_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      }),
      loadTimer,
    ]);

    _instance = ff;
    return ff;
  })();

  return _loadPromise;
}

export interface DecodeOptions {
  /** Source video Blob or URL. */
  source: Blob | string;
  /** Output container format passed to ffmpeg -f. Default: "mp4". */
  format?: string;
  /** Additional ffmpeg arguments injected before -f output. */
  extraArgs?: string[];
  /** Optional progress callback (ratio 0–1). */
  onProgress?: (p: DecodeProgress) => void;
}

/**
 * Transcode/remux `source` via FFmpeg.wasm.
 * Returns the output as a Uint8Array.
 * Caches the result in OPFS keyed by a hash of the source URL (if string).
 */
export async function ffmpegDecode(opts: DecodeOptions): Promise<Uint8Array> {
  const cacheKey =
    typeof opts.source === "string"
      ? `ffwasm_${btoa(opts.source).slice(0, 32)}.${opts.format ?? "mp4"}`
      : null;

  if (cacheKey) {
    const cached = await opfsRead(cacheKey);
    if (cached) return cached;
  }

  const ff = await getFFmpeg();

  if (opts.onProgress) {
    const handler = ({ progress }: { progress: number }) =>
      opts.onProgress!({ ratio: Math.min(1, progress) });
    ff.on("progress", handler);
  }

  let inputData: Uint8Array;
  if (typeof opts.source === "string") {
    const resp = await fetch(opts.source);
    inputData = new Uint8Array(await resp.arrayBuffer());
  } else {
    inputData = new Uint8Array(await opts.source.arrayBuffer());
  }

  const inputName = "input_src";
  const outputName = `output.${opts.format ?? "mp4"}`;

  await ff.writeFile(inputName, inputData);

  const args = [
    "-i", inputName,
    ...(opts.extraArgs ?? []),
    "-c", "copy",
    outputName,
  ];

  const exitCode = await ff.exec(args);
  if (exitCode !== 0) {
    throw new Error(`FFmpeg.wasm exited with code ${exitCode}`);
  }

  const output = await ff.readFile(outputName);
  await ff.deleteFile(inputName);
  await ff.deleteFile(outputName);

  if (cacheKey) {
    await opfsWrite(cacheKey, output);
  }

  return output;
}

/** Reset the singleton (e.g., after a fatal error). */
export function resetFFmpegInstance(): void {
  _instance = null;
  _loadPromise = null;
}
