"use client";

import { useState, useCallback } from "react";
import axios from "axios";
import { runPreflight } from "@/lib/api";
import type { ClipCandidatePayload, PreflightResult } from "@/types/preflight";

export interface UsePreflightReturn {
  isRunning: boolean;
  result: PreflightResult | null;
  error: string | null;
  isPremiumGated: boolean;
  triggerPreflight: (
    youtubeUrl: string,
    candidates: ClipCandidatePayload[],
    isPremium: boolean,
    userId: string,
  ) => Promise<void>;
  reset: () => void;
}

export function usePreflight(): UsePreflightReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPremiumGated, setIsPremiumGated] = useState(false);

  const triggerPreflight = useCallback(
    async (
      youtubeUrl: string,
      candidates: ClipCandidatePayload[],
      isPremium: boolean,
      userId: string,
    ) => {
      setIsRunning(true);
      setError(null);
      setIsPremiumGated(false);
      setResult(null);

      try {
        const res = await runPreflight(youtubeUrl, candidates, isPremium, userId);
        setResult(res);
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          if (err.response?.status === 402) {
            setIsPremiumGated(true);
          } else if (err.response?.status === 503) {
            setError("Pre-Flight service unavailable — backend starting up.");
          } else if (err.response?.status === 504) {
            setError("Analysis timed out. Try a shorter clip.");
          } else {
            const detail = err.response?.data?.detail;
            setError(typeof detail === "string" ? detail : "Pre-Flight analysis failed.");
          }
        } else {
          setError(err instanceof Error ? err.message : "Unexpected error.");
        }
      } finally {
        setIsRunning(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setIsPremiumGated(false);
  }, []);

  return { isRunning, result, error, isPremiumGated, triggerPreflight, reset };
}
