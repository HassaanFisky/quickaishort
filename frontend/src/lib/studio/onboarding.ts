/**
 * EP-008 — Editor onboarding API client.
 */

import axios from "axios";
import { API_URL } from "@/lib/api";

export type OnboardingStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "skipped";

export interface EditorOnboardingV1 {
  status: OnboardingStatus;
  step_index: number;
  version: number;
  updated_at: string;
}

export interface OnboardingGetResponse {
  editor_v1: EditorOnboardingV1;
  auto_show: boolean;
}

const LOCAL_KEY = "qai_onboarding_editor_v1";

export async function fetchOnboarding(): Promise<OnboardingGetResponse> {
  const { data } = await axios.get<OnboardingGetResponse>(
    `${API_URL}/api/studio/v1/me/onboarding`,
  );
  return data;
}

export async function saveOnboarding(
  status: OnboardingStatus,
  step_index: number,
): Promise<EditorOnboardingV1> {
  const { data } = await axios.put<EditorOnboardingV1>(
    `${API_URL}/api/studio/v1/me/onboarding`,
    { status, step_index },
  );
  try {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({ status, step_index, at: Date.now() }),
    );
  } catch {
    /* ignore */
  }
  return data;
}

/** Settings replay — force show once. */
export function requestTourReplay(): void {
  try {
    sessionStorage.setItem("qai_onboarding_replay", "1");
  } catch {
    /* ignore */
  }
}

export function consumeTourReplay(): boolean {
  try {
    if (sessionStorage.getItem("qai_onboarding_replay") === "1") {
      sessionStorage.removeItem("qai_onboarding_replay");
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
