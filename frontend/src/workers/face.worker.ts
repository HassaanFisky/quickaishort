
import {
  FilesetResolver,
  FaceDetector,
  FaceDetectorResult,
} from "@mediapipe/tasks-vision";
import { WorkerMessage } from "@/types/pipeline";

interface WorkerGlobal {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (ev: MessageEvent) => void): void;
}
const workerCtx = self as unknown as WorkerGlobal;

let faceDetector: FaceDetector | null = null;
let isBusy = false;

// Initialize MediaPipe Face Detector
const initializeFaceDetector = async () => {
  try {
    sendMessage({
      type: "status",
      stage: "init",
      payload: { message: "Loading Face Detection Model..." },
      timestamp: Date.now(),
    });

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm",
    );

    faceDetector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
    });

    sendMessage({
      type: "status",
      stage: "ready",
      payload: { message: "Face Detector Ready" },
      timestamp: Date.now(),
    });
  } catch (error) {
    sendMessage({
      type: "error",
      stage: "init",
      payload: { message: "Failed to load Face Detector", error },
      timestamp: Date.now(),
    });
  }
};

workerCtx.addEventListener("message", async (event) => {
  if (event.data.type === "init") {
    await initializeFaceDetector();
    return;
  }

  if (event.data.type === "detect" && faceDetector) {
    if (isBusy) return;
    isBusy = true;

    try {
      const { frame, timestamp } = event.data.payload;
      const result: FaceDetectorResult = faceDetector.detectForVideo(
        frame,
        timestamp,
      );
      // Release GPU texture memory immediately — ImageBitmaps must be explicitly
      // closed or they accumulate. At 30fps this is ~30 × 8 MB/frame without close().
      (frame as ImageBitmap).close();

      if (result.detections.length > 0) {
        const bestFace = result.detections[0];
        const box = bestFace.boundingBox;

        sendMessage({
          type: "face_detected",
          stage: "detect",
          payload: {
            face: {
              box: {
                x: box?.originX ?? 0,
                y: box?.originY ?? 0,
                width: box?.width ?? 0,
                height: box?.height ?? 0,
              },
              confidence: bestFace.categories[0].score,
            },
          },
          timestamp: Date.now(),
        });
      } else {
        // No face in this frame — notify tracker so stale reframing is cleared
        sendMessage({
          type: "face_detected",
          stage: "detect",
          payload: { face: null },
          timestamp: Date.now(),
        });
      }
    } catch (e) {
      console.error("Face Detection Error:", e);
    } finally {
      isBusy = false;
    }
  }
});

function sendMessage(msg: WorkerMessage) {
  workerCtx.postMessage(msg);
}
