"use client";

/** Shared types for the masking suite. */

export type MaskShape = "rect" | "ellipse" | "bezier" | "ai_person";

export interface Point2D {
  x: number; // normalised 0–1
  y: number; // normalised 0–1
}

export interface RectMask {
  shape: "rect";
  x: number;       // normalised 0–1
  y: number;
  width: number;   // normalised 0–1
  height: number;
  feather?: number; // 0–1, default 0
  invert?: boolean;
}

export interface EllipseMask {
  shape: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation?: number; // degrees
  feather?: number;
  invert?: boolean;
}

export interface BezierMask {
  shape: "bezier";
  points: Point2D[];   // closed bezier path, normalised
  feather?: number;
  invert?: boolean;
}

export interface AiPersonMask {
  shape: "ai_person";
  confidence?: number; // 0–1 minimum confidence threshold, default 0.5
  invert?: boolean;
}

export type ClipMask = RectMask | EllipseMask | BezierMask | AiPersonMask;

export interface MaskState {
  clipId: string;
  masks: ClipMask[];
  blendMode?: "normal" | "multiply" | "screen";
}
