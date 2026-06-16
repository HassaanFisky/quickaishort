"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

type SwipeDirection = "left" | "right" | "up" | "down";

interface SwipeOptions {
  onSwipe: (direction: SwipeDirection, distance: number, velocity: number) => void;
  threshold?: number;
  enabled?: boolean;
}

interface PinchOptions {
  onPinch: (scale: number, center: { x: number; y: number }) => void;
  enabled?: boolean;
}

interface LongPressOptions {
  onLongPress: (point: { clientX: number; clientY: number }) => void;
  delay?: number;
  moveThreshold?: number;
  enabled?: boolean;
}

function useGestureRef(
  elementRef?: RefObject<HTMLElement | null>,
): RefObject<HTMLElement | null> {
  const internalRef = useRef<HTMLElement | null>(null);
  return elementRef ?? internalRef;
}

export function useSwipeGesture(
  elementRef: RefObject<HTMLElement | null> | undefined,
  { onSwipe, threshold = 50, enabled = true }: SwipeOptions,
): { ref: RefObject<HTMLElement | null>; isGesturing: boolean } {
  const ref = useGestureRef(elementRef);
  const [isGesturing, setIsGesturing] = useState(false);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const onPointerDown = (e: PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      setIsGesturing(true);
    };

    const onPointerUp = (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      setIsGesturing(false);
      if (!s) return;

      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      const elapsed = Math.max(1, performance.now() - s.t);
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const distance = absX > absY ? absX : absY;
      if (distance < threshold) return;

      const velocity = distance / elapsed;
      const direction: SwipeDirection =
        absX > absY ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      onSwipe(direction, distance, velocity);
    };

    const onPointerCancel = () => {
      start.current = null;
      setIsGesturing(false);
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [ref, onSwipe, threshold, enabled]);

  return { ref, isGesturing };
}

export function usePinchGesture(
  elementRef: RefObject<HTMLElement | null> | undefined,
  { onPinch, enabled = true }: PinchOptions,
): { ref: RefObject<HTMLElement | null>; isGesturing: boolean } {
  const ref = useGestureRef(elementRef);
  const [isGesturing, setIsGesturing] = useState(false);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const startDistance = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const distanceOf = (pts: { x: number; y: number }[]) =>
      Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);

    const centerOf = (pts: { x: number; y: number }[]) => ({
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    });

    const onPointerDown = (e: PointerEvent) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2) {
        startDistance.current = distanceOf([...pointers.current.values()]);
        setIsGesturing(true);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size !== 2 || startDistance.current === 0) return;
      const pts = [...pointers.current.values()];
      const newDistance = distanceOf(pts);
      const scale = newDistance / startDistance.current;
      onPinch(scale, centerOf(pts));
      startDistance.current = newDistance;
    };

    const endPointer = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) {
        startDistance.current = 0;
        setIsGesturing(false);
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", endPointer);
    el.addEventListener("pointercancel", endPointer);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", endPointer);
      el.removeEventListener("pointercancel", endPointer);
      pointers.current.clear();
    };
  }, [ref, onPinch, enabled]);

  return { ref, isGesturing };
}

export function useLongPress(
  elementRef: RefObject<HTMLElement | null> | undefined,
  { onLongPress, delay = 500, moveThreshold = 10, enabled = true }: LongPressOptions,
): { ref: RefObject<HTMLElement | null>; isGesturing: boolean } {
  const ref = useGestureRef(elementRef);
  const [isGesturing, setIsGesturing] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const timeoutId = useRef<number | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const clear = () => {
      if (timeoutId.current !== undefined) window.clearTimeout(timeoutId.current);
      timeoutId.current = undefined;
      start.current = null;
      setIsGesturing(false);
    };

    const onPointerDown = (e: PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY };
      setIsGesturing(true);
      timeoutId.current = window.setTimeout(() => {
        if (!start.current) return;
        onLongPress({ clientX: e.clientX, clientY: e.clientY });
        clear();
      }, delay);
    };

    const onPointerMove = (e: PointerEvent) => {
      const s = start.current;
      if (!s) return;
      const dist = Math.hypot(e.clientX - s.x, e.clientY - s.y);
      if (dist > moveThreshold) clear();
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", clear);
    el.addEventListener("pointercancel", clear);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", clear);
      el.removeEventListener("pointercancel", clear);
      clear();
    };
  }, [ref, onLongPress, delay, moveThreshold, enabled]);

  return { ref, isGesturing };
}
