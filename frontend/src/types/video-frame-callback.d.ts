// Ambient type declarations for the requestVideoFrameCallback Stage-3 API.
// Kept in a dedicated .d.ts so the augmentation is visible project-wide
// without risking duplicate-identifier collisions inside module files.

interface VideoFrameCallbackMetadata {
  captureTime?: DOMHighResTimeStamp;
  expectedDisplayTime: DOMHighResTimeStamp;
  height: number;
  mediaTime: number;
  presentationTime: DOMHighResTimeStamp;
  presentedFrames: number;
  processingDuration?: number;
  receiveTime?: DOMHighResTimeStamp;
  width: number;
}

type VideoFrameRequestCallback = (
  now: DOMHighResTimeStamp,
  metadata: VideoFrameCallbackMetadata,
) => void;

interface HTMLVideoElement {
  requestVideoFrameCallback(callback: VideoFrameRequestCallback): number;
  cancelVideoFrameCallback(handle: number): void;
}
