"use client";

/**
 * Web Audio multi-bus mix graph.
 *
 * Bus topology:
 *   sourceNode → [RNNoise worklet?] → clipGain → channelSend → masterBus → limiter → destination
 *
 * RNNoise noise suppression: rnnoise.wasm (© Mozilla, BSD 3-clause)
 * Attribution: https://github.com/mozilla/rnnoise
 */

import { applyAutomation, type AutomationLane } from "./automation";

export interface BusConfig {
  clipId: string;
  sourceElement: HTMLMediaElement;
  denoiseEnabled?: boolean;
  gainDb?: number;
}

interface Bus {
  clipId: string;
  source: MediaElementAudioSourceNode;
  clipGain: GainNode;
  denoiseNode: AudioWorkletNode | null;
  send: GainNode;
}

const WORKLET_URL = "/audio-worklets/rnnoise-worklet.js";
const LIMITER_URL = "/audio-worklets/limiter-worklet.js";

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export class MixGraph {
  private ctx: AudioContext;
  private masterBus: GainNode;
  private limiterNode: AudioWorkletNode | null = null;
  private buses = new Map<string, Bus>();
  private _workletLoaded = false;
  private _limiterLoaded = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.masterBus = ctx.createGain();
    this.masterBus.gain.value = 1.0;
    this.masterBus.connect(ctx.destination);
  }

  static async create(): Promise<MixGraph> {
    const ctx = new AudioContext({ latencyHint: "playback" });
    return new MixGraph(ctx);
  }

  async addBus(cfg: BusConfig): Promise<void> {
    if (this.buses.has(cfg.clipId)) return;

    const source = this.ctx.createMediaElementSource(cfg.sourceElement);
    const clipGain = this.ctx.createGain();
    clipGain.gain.value = cfg.gainDb !== undefined ? dbToLinear(cfg.gainDb) : 1.0;

    let denoiseNode: AudioWorkletNode | null = null;
    if (cfg.denoiseEnabled) {
      denoiseNode = await this._getDenoiseNode();
    }

    const send = this.ctx.createGain();
    send.gain.value = 1.0;

    // Wire: source → [denoiseNode] → clipGain → send → masterBus
    let chain: AudioNode = source;
    if (denoiseNode) { chain.connect(denoiseNode); chain = denoiseNode; }
    chain.connect(clipGain);
    clipGain.connect(send);
    send.connect(this.masterBus);

    this.buses.set(cfg.clipId, { clipId: cfg.clipId, source, clipGain, denoiseNode, send });
  }

  removeBus(clipId: string): void {
    const bus = this.buses.get(clipId);
    if (!bus) return;
    bus.send.disconnect();
    bus.clipGain.disconnect();
    if (bus.denoiseNode) bus.denoiseNode.disconnect();
    bus.source.disconnect();
    this.buses.delete(clipId);
  }

  setClipGain(clipId: string, gainDb: number): void {
    const bus = this.buses.get(clipId);
    if (!bus) return;
    bus.clipGain.gain.setTargetAtTime(
      dbToLinear(gainDb),
      this.ctx.currentTime,
      0.015
    );
  }

  setMasterGain(gainDb: number): void {
    this.masterBus.gain.setTargetAtTime(
      dbToLinear(gainDb),
      this.ctx.currentTime,
      0.015
    );
  }

  setDenoiseEnabled(clipId: string, enabled: boolean): void {
    const bus = this.buses.get(clipId);
    if (!bus?.denoiseNode) return;
    bus.denoiseNode.port.postMessage({ type: "bypass", enabled: !enabled });
  }

  applyAutomationToClip(clipId: string, lanes: AutomationLane[]): void {
    const bus = this.buses.get(clipId);
    if (!bus) return;
    applyAutomation(lanes, { gain: bus.clipGain.gain }, this.ctx.currentTime);
  }

  async enableLimiter(): Promise<void> {
    if (this.limiterNode || this._limiterLoaded) return;
    try {
      await this.ctx.audioWorklet.addModule(LIMITER_URL);
      this._limiterLoaded = true;
      this.limiterNode = new AudioWorkletNode(this.ctx, "limiter-worklet");
      this.masterBus.disconnect(this.ctx.destination);
      this.masterBus.connect(this.limiterNode);
      this.limiterNode.connect(this.ctx.destination);
    } catch {
      // Limiter worklet unavailable — continue without it
    }
  }

  resume(): Promise<void> {
    return this.ctx.resume();
  }

  suspend(): Promise<void> {
    return this.ctx.suspend();
  }

  destroy(): void {
    for (const id of this.buses.keys()) this.removeBus(id);
    this.masterBus.disconnect();
    this.limiterNode?.disconnect();
    this.ctx.close();
  }

  private async _getDenoiseNode(): Promise<AudioWorkletNode | null> {
    if (!this._workletLoaded) {
      try {
        await this.ctx.audioWorklet.addModule(WORKLET_URL);
        this._workletLoaded = true;
      } catch {
        return null;
      }
    }
    return new AudioWorkletNode(this.ctx, "rnnoise-worklet");
  }
}
