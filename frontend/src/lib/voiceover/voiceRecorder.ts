// @ts-nocheck
"use client";

/** Browser-based voiceover recorder using MediaRecorder + Web Audio for level metering. */
export class VoiceRecorder {
  private _stream: MediaStream | null = null;
  private _recorder: MediaRecorder | null = null;
  private _chunks: Blob[] = [];
  private _ctx: AudioContext | null = null;
  private _analyser: AnalyserNode | null = null;
  private _levelBuf: Float32Array = new Float32Array(0);

  async start(): Promise<void> {
    this._stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this._chunks = [];

    this._ctx = new AudioContext();
    const src = this._ctx.createMediaStreamSource(this._stream);
    this._analyser = this._ctx.createAnalyser();
    this._analyser.fftSize = 256;
    this._levelBuf = new Float32Array(this._analyser.fftSize);
    src.connect(this._analyser);

    this._recorder = new MediaRecorder(this._stream, { mimeType: this._bestMime() });
    this._recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this._chunks.push(e.data);
    };
    this._recorder.start(100);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this._recorder) { resolve(new Blob()); return; }
      this._recorder.onstop = () => {
        const blob = new Blob(this._chunks, { type: this._recorder?.mimeType ?? "audio/webm" });
        resolve(blob);
      };
      this._recorder.stop();
      this._stream?.getTracks().forEach((t) => t.stop());
    });
  }

  /** RMS level 0–1. Call on each animation frame while recording. */
  getLevel(): number {
    if (!this._analyser) return 0;
    this._analyser.getFloatTimeDomainData(this._levelBuf);
    let sum = 0;
    for (let i = 0; i < this._levelBuf.length; i++) {
      sum += this._levelBuf[i] * this._levelBuf[i];
    }
    return Math.min(1, Math.sqrt(sum / this._levelBuf.length) * 4);
  }

  destroy(): void {
    this._stream?.getTracks().forEach((t) => t.stop());
    this._ctx?.close();
    this._stream = null;
    this._recorder = null;
    this._ctx = null;
    this._analyser = null;
  }

  private _bestMime(): string {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
    return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
  }
}
