"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { uploadVideo, getVideoTaskStatus } from "@/lib/api";
import type { FrameAdjustment, VideoUploadState, VideoTaskStatus } from "@/types/video";

const DEFAULT_FRAME_ADJUSTMENTS: FrameAdjustment = {
  brightness: 1.0,
  contrast: 1.0,
  saturation: 1.0,
  hue: 0.0,
  blur: 0.0,
};

interface VideoUploadProps {
  onUploadComplete?: (fileId: string, taskId: string | null) => void;
  onError?: (error: string) => void;
  maxFileSizeMB?: number;
}

export default function VideoUpload({
  onUploadComplete,
  onError,
  maxFileSizeMB = 500,
}: VideoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<VideoUploadState>({
    file: null,
    fileName: "",
    fileSize: 0,
    processVideo: false,
    frameAdjustments: DEFAULT_FRAME_ADJUSTMENTS,
    uploadProgress: 0,
    uploadedFileId: null,
    taskId: null,
    taskState: "idle",
    taskResult: null,
    errorMessage: null,
    successMessage: null,
  });

  const [isDragging, setIsDragging] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleFileSelect = useCallback((file: File | null) => {
    if (!file) return;

    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxFileSizeMB) {
      const errorMsg = `File size (${fileSizeMB.toFixed(1)}MB) exceeds maximum (${maxFileSizeMB}MB)`;
      setState((prev) => ({ ...prev, errorMessage: errorMsg }));
      onError?.(errorMsg);
      return;
    }

    // Validate file type
    if (!file.type.startsWith("video/")) {
      const errorMsg = "Please select a valid video file";
      setState((prev) => ({ ...prev, errorMessage: errorMsg }));
      onError?.(errorMsg);
      return;
    }

    setState((prev) => ({
      ...prev,
      file,
      fileName: file.name,
      fileSize: file.size,
      errorMessage: null,
      successMessage: null,
    }));
  }, [maxFileSizeMB, onError]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect],
  );

  const handleFrameAdjustmentChange = useCallback(
    (key: keyof FrameAdjustment, value: number) => {
      setState((prev) => ({
        ...prev,
        frameAdjustments: {
          ...prev.frameAdjustments,
          [key]: value,
        },
      }));
    },
    [],
  );

  const handleUpload = useCallback(async () => {
    if (!state.file) return;

    setState((prev) => ({
      ...prev,
      taskState: "uploading",
      errorMessage: null,
      successMessage: null,
    }));

    try {
      const response = await uploadVideo(
        state.file,
        state.processVideo,
        state.processVideo ? state.frameAdjustments : undefined,
      );

      setState((prev) => ({
        ...prev,
        uploadedFileId: response.file_id,
        taskId: response.task_id,
        successMessage: response.message,
      }));

      // If processing, start polling
      if (response.task_id) {
        setState((prev) => ({ ...prev, taskState: "pending" }));
        startTaskPolling(response.task_id);
      } else {
        setState((prev) => ({ ...prev, taskState: "success" }));
        onUploadComplete?.(response.file_id, null);
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : "Upload failed. Please try again.";
      setState((prev) => ({
        ...prev,
        taskState: "failed",
        errorMessage: errorMsg,
      }));
      onError?.(errorMsg);
    }
  }, [state.file, state.processVideo, state.frameAdjustments, onUploadComplete, onError]);

  const startTaskPolling = useCallback((taskId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const status = await getVideoTaskStatus(taskId);

        setState((prev) => ({
          ...prev,
          taskState: status.state as VideoUploadState["taskState"],
          taskResult: status.result || null,
          errorMessage: status.error || null,
        }));

        // Stop polling on completion
        if (status.state === "success" || status.state === "failed") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

          if (status.state === "success" && status.result) {
            setState((prev) => ({
              ...prev,
              successMessage: `Video processed successfully! Output: ${status.result!.output_file_id}`,
            }));
            onUploadComplete?.(
              status.result.input_file_id,
              taskId,
            );
          } else if (status.state === "failed") {
            const errorMsg = status.error || "Processing failed. Please try again.";
            onError?.(errorMsg);
          }
        }
      } catch (error) {
        console.error("Failed to poll task status:", error);
      }
    }, 2000); // Poll every 2 seconds
  }, [onUploadComplete, onError]);

  const getProgressPercentage = (): number => {
    if (state.taskState === "uploading") return 25;
    if (state.taskState === "pending") return 50;
    if (state.taskState === "processing") return 75;
    if (state.taskState === "success") return 100;
    if (state.taskState === "failed") return 0;
    return 0;
  };

  const isProcessing = ["uploading", "pending", "processing"].includes(state.taskState);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* File Input Area */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl p-8 transition-colors ${
            isDragging
              ? "border-purple-500 bg-purple-500/10"
              : "border-zinc-400 hover:border-purple-500 bg-zinc-900/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full cursor-pointer"
            disabled={isProcessing}
          >
            <div className="text-center">
              <motion.div
                animate={{ y: isDragging ? -5 : 0 }}
                className="text-4xl mb-3 inline-block"
              >
                📹
              </motion.div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {state.fileName || "Drop your video here"}
              </h3>
              <p className="text-sm text-zinc-400">
                {state.fileName
                  ? `${(state.fileSize / (1024 * 1024)).toFixed(1)}MB`
                  : `or click to browse (max ${maxFileSizeMB}MB)`}
              </p>
            </div>
          </button>
        </div>
      </motion.div>

      {/* Frame Adjustments Section */}
      <AnimatePresence>
        {state.file && !isProcessing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 bg-zinc-900 rounded-xl p-6 border border-zinc-800"
          >
            <div className="flex items-center justify-between mb-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.processVideo}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      processVideo: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 cursor-pointer"
                />
                <span className="text-sm font-medium text-white">
                  Process with frame adjustments
                </span>
              </label>
            </div>

            <AnimatePresence>
              {state.processVideo && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  {/* Brightness */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-zinc-300">
                        Brightness
                      </label>
                      <span className="text-xs text-zinc-400">
                        {state.frameAdjustments.brightness.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={state.frameAdjustments.brightness}
                      onChange={(e) =>
                        handleFrameAdjustmentChange("brightness", parseFloat(e.target.value))
                      }
                      className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>

                  {/* Contrast */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-zinc-300">
                        Contrast
                      </label>
                      <span className="text-xs text-zinc-400">
                        {state.frameAdjustments.contrast.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={state.frameAdjustments.contrast}
                      onChange={(e) =>
                        handleFrameAdjustmentChange("contrast", parseFloat(e.target.value))
                      }
                      className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>

                  {/* Saturation */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-zinc-300">
                        Saturation
                      </label>
                      <span className="text-xs text-zinc-400">
                        {state.frameAdjustments.saturation.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={state.frameAdjustments.saturation}
                      onChange={(e) =>
                        handleFrameAdjustmentChange("saturation", parseFloat(e.target.value))
                      }
                      className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>

                  {/* Hue */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-zinc-300">
                        Hue Shift
                      </label>
                      <span className="text-xs text-zinc-400">
                        {state.frameAdjustments.hue.toFixed(0)}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="10"
                      value={state.frameAdjustments.hue}
                      onChange={(e) =>
                        handleFrameAdjustmentChange("hue", parseFloat(e.target.value))
                      }
                      className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>

                  {/* Blur */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-zinc-300">
                        Blur
                      </label>
                      <span className="text-xs text-zinc-400">
                        {state.frameAdjustments.blur.toFixed(1)}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      step="1"
                      value={state.frameAdjustments.blur}
                      onChange={(e) =>
                        handleFrameAdjustmentChange("blur", parseFloat(e.target.value))
                      }
                      className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Button */}
      <AnimatePresence>
        {state.file && !isProcessing && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleUpload}
            className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-lg transition-all duration-200 mb-4"
          >
            {state.processVideo ? "Upload & Process" : "Upload Video"}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Progress Bar */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mb-6"
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-white capitalize">
                {state.taskState === "uploading" && "Uploading..."}
                {state.taskState === "pending" && "Queued for processing..."}
                {state.taskState === "processing" && "Processing video..."}
              </span>
              <span className="text-xs text-zinc-400">{getProgressPercentage()}%</span>
            </div>
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${getProgressPercentage()}%` }}
                transition={{ type: "spring", damping: 20, stiffness: 300 }}
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Message */}
      <AnimatePresence>
        {state.taskState === "success" && state.successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 p-4 bg-emerald-900/20 border border-emerald-800 rounded-lg"
          >
            <div className="flex gap-3">
              <span className="text-xl">✓</span>
              <div>
                <p className="text-sm font-medium text-emerald-200">Success</p>
                <p className="text-sm text-emerald-300 mt-1">{state.successMessage}</p>
                {state.uploadedFileId && (
                  <p className="text-xs text-zinc-400 mt-2 font-mono break-all">
                    File ID: {state.uploadedFileId}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Message */}
      <AnimatePresence>
        {state.errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 p-4 bg-red-900/20 border border-red-800 rounded-lg"
          >
            <div className="flex gap-3">
              <span className="text-xl">✕</span>
              <div>
                <p className="text-sm font-medium text-red-200">Error</p>
                <p className="text-sm text-red-300 mt-1">{state.errorMessage}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task Details */}
      <AnimatePresence>
        {state.taskId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-4 p-3 bg-zinc-900 rounded-lg border border-zinc-800 text-xs text-zinc-400 font-mono"
          >
            <p className="break-all">Task ID: {state.taskId}</p>
            <p className="mt-1 capitalize">State: {state.taskState}</p>
            {state.taskResult && (
              <>
                <p className="mt-1 break-all">
                  Input: {state.taskResult.input_file_id}
                </p>
                {state.taskResult.output_file_id && (
                  <p className="break-all">Output: {state.taskResult.output_file_id}</p>
                )}
                <p className="mt-1">
                  Size: {(state.taskResult.output_size / (1024 * 1024)).toFixed(2)}MB
                </p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
