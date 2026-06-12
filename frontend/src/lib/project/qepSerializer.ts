"use client";

import { QEP_VERSION, type QepProject } from "./qepTypes";

function makeId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/**
 * Build a QepProject JSON string from the current editor store snapshot.
 * Accepts a plain-object snapshot so it stays decoupled from Zustand internals.
 */
export function exportQep(snapshot: {
  clips?: unknown[];
  aspectRatio?: string;
  masterGainDb?: number;
  projectId?: string;
  projectTitle?: string;
}): string {
  const now = new Date().toISOString();
  const project: QepProject = {
    version: QEP_VERSION,
    id: snapshot.projectId ?? makeId(),
    title: snapshot.projectTitle ?? "Untitled Project",
    createdAt: now,
    updatedAt: now,
    aspectRatio: (snapshot.aspectRatio as QepProject["aspectRatio"]) ?? "9:16",
    clips: (snapshot.clips ?? []) as QepProject["clips"],
    audioBuses: [],
    masterGainDb: snapshot.masterGainDb ?? 0,
  };
  return JSON.stringify(project, null, 2);
}

/**
 * Parse and basic-validate a QEP JSON string.
 * Returns the project on success, throws on invalid input.
 */
export function importQep(raw: string): QepProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("QEP: invalid JSON");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as Record<string, unknown>)["version"] !== QEP_VERSION
  ) {
    throw new Error("QEP: unsupported version or malformed file");
  }
  return parsed as QepProject;
}
