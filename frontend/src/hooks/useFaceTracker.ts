import { useEffect, useRef, useState, useCallback } from "react";
import { WorkerMessage, FaceBox, ReframingData } from "@/types/pipeline";

export function useFaceTracker() {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [reframingData, setReframingData] = useState<ReframingData | null>(null);

  // Smooth box state for dampening (pixel coords)
  const smoothBox = useRef<FaceBox | null>(null);
  // Video dimensions captured from detect() calls — needed for normalization
  const videoDims = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../workers/face.worker.ts", import.meta.url),
    );

    workerRef.current.onmessage = (event) => {
      const msg = event.data as WorkerMessage;

      if (msg.type === "status" && msg.stage === "ready") {
        setIsReady(true);
      }

      if (msg.type === "face_detected" && msg.payload.face) {
        const rawBox = msg.payload.face.box;
        const dims = videoDims.current;

        // LERP dampening
        if (!smoothBox.current) {
          smoothBox.current = rawBox;
        } else {
          const f = 0.15;
          smoothBox.current = {
            x: lerp(smoothBox.current.x, rawBox.x, f),
            y: lerp(smoothBox.current.y, rawBox.y, f),
            width: lerp(smoothBox.current.width, rawBox.width, f),
            height: lerp(smoothBox.current.height, rawBox.height, f),
          };
        }

        const box = smoothBox.current;

        // Normalize center to 0-1 using captured video dimensions.
        // FFmpeg crop filter uses center.x as iw*centerX, so it must be 0-1.
        const centerX = dims
          ? Math.min(1, Math.max(0, (box.x + box.width / 2) / dims.width))
          : 0.5;
        const centerY = dims
          ? Math.min(1, Math.max(0, (box.y + box.height / 2) / dims.height))
          : 0.5;

        setReframingData({
          center: { x: centerX, y: centerY },
          scale: 1.0,
          faceDetected: true,
          boundingBox: { ...box },
        });
      }
    };

    workerRef.current.postMessage({ type: "init" });

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const detect = useCallback(
    (video: HTMLVideoElement) => {
      if (!workerRef.current || !isReady || video.paused || video.ended) return;

      // Capture video dimensions once they are available
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        videoDims.current = { width: video.videoWidth, height: video.videoHeight };
      }

      createImageBitmap(video)
        .then((bitmap) => {
          workerRef.current?.postMessage(
            { type: "detect", payload: { frame: bitmap, timestamp: Date.now() } },
            [bitmap],
          );
        })
        .catch(() => {
          // Frame not ready — drop silently
        });
    },
    [isReady],
  );

  return { isReady, reframingData, detect };
}

function lerp(start: number, end: number, factor: number) {
  return start + (end - start) * factor;
}
