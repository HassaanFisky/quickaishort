/**
 * Client-side video trim + export using MediaRecorder.
 * Used for local file uploads where server-side processing isn't available.
 * Works in Chrome, Firefox, Edge. Safari support is limited.
 */

export async function exportLocalClip(
  file: File,
  startSec: number,
  endSec: number,
  filename: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = objectUrl;
  video.muted = false;
  video.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Failed to load video file"));
  });

  video.currentTime = startSec;

  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
    // In case onseeked already fired (fast seek)
    if (video.readyState >= 2) resolve();
  });

  const captureStream = (
    video as HTMLVideoElement & { captureStream(): MediaStream; mozCaptureStream(): MediaStream }
  ).captureStream?.() ?? (
    video as HTMLVideoElement & { captureStream(): MediaStream; mozCaptureStream(): MediaStream }
  ).mozCaptureStream?.();

  if (!captureStream) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("captureStream not supported in this browser");
  }

  const mime = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]
    .find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(captureStream, { mimeType: mime });
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const clipDuration = Math.max(0.1, endSec - startSec);

  await new Promise<void>((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename.replace(/\.[^.]+$/, `.${ext}`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      resolve();
    };
    recorder.onerror = (e) => reject(new Error(String(e)));

    recorder.start(200);
    video.play().catch(reject);

    let elapsed = 0;
    const tick = setInterval(() => {
      elapsed += 0.2;
      onProgress?.(Math.min(99, Math.round((elapsed / clipDuration) * 100)));
      if (elapsed >= clipDuration) {
        clearInterval(tick);
        recorder.stop();
        video.pause();
      }
    }, 200);
  });
}
