// @ts-nocheck
/**
 * FaceTracker — thin wrapper around MediaPipe FaceDetection.
 * Falls back to an empty result when the WASM model hasn't loaded yet.
 */

import type { FaceBox } from "./reframeTypes";

type MPFaceDetection = {
  setOptions(opts: Record<string, unknown>): Promise<void>;
  send(input: { image: HTMLVideoElement }): Promise<void>;
  onResults(cb: (results: unknown) => void): void;
  close(): void;
};

export class FaceTracker {
  private _detector: MPFaceDetection | null = null;
  private _pending: FaceBox[] = [];
  private _ready = false;

  async init(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mp: any =
        typeof window !== "undefined" &&
        (window as any).FaceDetection;
      if (!mp) return;
      this._detector = new mp({ locateFile: (f: string) => `/mediapipe/${f}` });
      await this._detector!.setOptions({ model: "short", minDetectionConfidence: 0.5 });
      this._detector!.onResults((res: any) => {
        this._pending = (res?.detections ?? []).map((d: any) => ({
          x: d.boundingBox?.xCenter - d.boundingBox?.width / 2,
          y: d.boundingBox?.yCenter - d.boundingBox?.height / 2,
          width: d.boundingBox?.width ?? 0,
          height: d.boundingBox?.height ?? 0,
          confidence: d.score?.[0] ?? 0,
        }));
      });
      this._ready = true;
    } catch {
      this._ready = false;
    }
  }

  async detect(videoEl: HTMLVideoElement): Promise<FaceBox[]> {
    if (!this._ready || !this._detector) return [];
    this._pending = [];
    await this._detector.send({ image: videoEl });
    return this._pending;
  }

  destroy(): void {
    this._detector?.close();
    this._detector = null;
    this._ready = false;
  }
}
