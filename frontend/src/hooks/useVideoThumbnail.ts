"use client";

import { useEffect, useState } from "react";

const DB_NAME = "qai-thumbnails";
const STORE_NAME = "frames";

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCached(key: string): Promise<string | undefined> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as string | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function setCached(key: string, value: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* IndexedDB unavailable — thumbnail just won't be cached */
  }
}

/**
 * Extracts a representative frame from a video URL for use as a thumbnail,
 * caching the result in IndexedDB by a hash of the URL. Silently returns
 * null (no thumbnail) if the source is cross-origin without CORS headers —
 * canvas extraction throws SecurityError on a tainted canvas in that case.
 */
export function useVideoThumbnail(videoSrc: string | null | undefined): string | null {
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  useEffect(() => {
    if (!videoSrc) {
      setThumbnail(null);
      return;
    }
    let cancelled = false;
    const key = hashString(videoSrc);
    let video: HTMLVideoElement | null = null;

    (async () => {
      const cached = await getCached(key);
      if (cancelled) return;
      if (cached) {
        setThumbnail(cached);
        return;
      }

      video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.preload = "metadata";

      video.onloadedmetadata = () => {
        if (cancelled || !video) return;
        video.currentTime = Math.min(1, (video.duration || 0) / 2);
      };

      video.onseeked = () => {
        if (cancelled || !video) return;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = Math.round((video.videoHeight / video.videoWidth) * 320) || 180;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          setThumbnail(dataUrl);
          void setCached(key, dataUrl);
        } catch {
          // Tainted canvas (source has no CORS headers) or decode failure.
        }
      };

      video.onerror = () => {
        /* Source unreachable or unsupported — no thumbnail. */
      };

      video.src = videoSrc;
    })();

    return () => {
      cancelled = true;
      if (video) {
        video.src = "";
        video.load();
      }
    };
  }, [videoSrc]);

  return thumbnail;
}
