"use client";

import { useState } from "react";
import VideoUpload from "@/components/VideoUpload";
import { toast } from "sonner";

export default function VideoUploadTestPage() {
  const [uploadedFileId, setUploadedFileId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-black p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-2">VideoUpload Component Test</h1>
        <p className="text-slate-400 mb-8">
          Test the video upload and frame adjustment processing pipeline
        </p>

        <div className="space-y-6">
          <VideoUpload
            onUploadComplete={(fileId, taskIdFromUpload) => {
              setUploadedFileId(fileId);
              setTaskId(taskIdFromUpload);
              toast.success("Upload completed successfully!");
            }}
            onError={(error) => {
              toast.error(`Upload error: ${error}`);
            }}
          />

          {uploadedFileId && (
            <div className="p-4 bg-emerald-900/30 border border-emerald-500/50 rounded-lg">
              <p className="text-emerald-300">
                <strong>File ID:</strong> {uploadedFileId}
              </p>
            </div>
          )}

          {taskId && (
            <div className="p-4 bg-blue-900/30 border border-blue-500/50 rounded-lg">
              <p className="text-blue-300">
                <strong>Task ID:</strong> {taskId}
              </p>
            </div>
          )}

          <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
            <h3 className="text-white font-semibold mb-2">Test Checklist</h3>
            <ul className="text-slate-300 space-y-1">
              <li>✓ Select a video file and upload it</li>
              <li>✓ Enable &quot;Process Video&quot; and adjust frame settings</li>
              <li>✓ Watch the progress bar update (uploading → pending → processing → success)</li>
              <li>✓ Verify success message shows output file ID</li>
              <li>✓ Check for errors in the browser console</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
