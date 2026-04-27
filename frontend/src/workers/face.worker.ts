/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  FilesetResolver,
  FaceDetector,
  FaceDetectorResult,
} from "@mediapipe/tasks-vision";
import { WorkerMessage } from "@/types/pipeline";

const ctx: Worker = self as any;

let faceDetector: FaceDetector | null = null;
let isBusy = false;

// Initialize MediaPipe Face Detector
const initializeFaceDetector = async () => {
  try {
    postMessage({
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

    postMessage({
      type: "status",
      stage: "ready",
      payload: { message: "Face Detector Ready" },
      timestamp: Date.now(),
    });
  } catch (error) {
    postMessage({
      type: "error",
      stage: "init",
      payload: { message: "Failed to load Face Detector", error },
      timestamp: Date.now(),
    });
  }
};

ctx.addEventListener("message", async (event) => {
  if (event.data.type === "init") {
    await initializeFaceDetector();
    return;
  }

  if (event.data.type === "detect" && faceDetector) {
    if (isBusy) return; // Drop frame if busy
    isBusy = true;

    try {
      const { frame, timestamp } = event.data.payload;
      const result: FaceDetectorResult = faceDetector.detectForVideo(
        frame,
        timestamp,
      );

      if (result.detections.length > 0) {
        // Get the most confident face
        const bestFace = result.detections[0];
        const box = bestFace.boundingBox;

        postMessage({
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
      }
    } catch (e) {
      console.error("Face Detection Error:", e);
    } finally {
      isBusy = false;
    }
  }
});

function postMessage(msg: WorkerMessage) {
  ctx.postMessage(msg);
}
