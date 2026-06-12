// @ts-nocheck — mp4-muxer references WebCodecs globals (EncodedVideoChunk etc.) not in TS 5.x bundled lib.dom.d.ts
/**
 * Thin wrapper around mp4-muxer 5.x for H.264/AAC MP4 creation.
 */
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

export interface Mp4MuxOptions {
  width: number;
  height: number;
  frameRate: number;
  sampleRate?: number;
  numberOfChannels?: number;
}

export class Mp4Mux {
  private muxer: Muxer<ArrayBufferTarget>;
  private target: ArrayBufferTarget;

  constructor(opts: Mp4MuxOptions) {
    this.target = new ArrayBufferTarget();
    const muxerOpts: any = {
      target: this.target,
      video: {
        codec: "avc",
        width: opts.width,
        height: opts.height,
        frameRate: opts.frameRate,
      },
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
    };
    if (opts.sampleRate) {
      muxerOpts.audio = {
        codec: "aac",
        numberOfChannels: opts.numberOfChannels ?? 2,
        sampleRate: opts.sampleRate,
      };
    }
    this.muxer = new Muxer(muxerOpts);
  }

  addVideoChunk(chunk: any, meta?: any): void {
    this.muxer.addVideoChunk(chunk, meta);
  }

  addAudioChunk(chunk: any, meta?: any): void {
    this.muxer.addAudioChunk(chunk, meta);
  }

  finalize(): Blob {
    this.muxer.finalize();
    return new Blob([this.target.buffer], { type: "video/mp4" });
  }
}
