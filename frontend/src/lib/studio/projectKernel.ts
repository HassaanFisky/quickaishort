/**
 * EP-002 Studio Project Kernel client (projector).
 * Active only when NEXT_PUBLIC_STUDIO_PROJECT_KERNEL === "1".
 * Flag off → zero behavior change for the rest of the editor.
 */

import axios from "axios";
import { API_URL } from "@/lib/api";
import type { RenderManifest } from "@/lib/render/renderManifest";

export function isStudioProjectKernelEnabled(): boolean {
  return process.env.NEXT_PUBLIC_STUDIO_PROJECT_KERNEL === "1";
}

export type CommandSource = "chat" | "ui_direct" | "orchestrator" | "automation";

export interface StudioProjectHead {
  project_id: string;
  revision: number;
  snapshot_revision: number;
  snapshot_hash: string | null;
  snapshot_manifest: RenderManifest | null;
  title: string;
  status: string;
  primary_asset_id: string | null;
  undo_stack: number[];
  redo_stack: number[];
}

export interface CommandAck {
  status: "accepted";
  command_id: string;
  event_ids: string[];
  new_revision: number;
  snapshot_manifest?: RenderManifest | null;
  snapshot_hash?: string | null;
}

export interface CommandRejectDetail {
  status: "rejected";
  reason: string;
  detail: string;
  head_revision?: number;
}

export interface ProjectCommandBody {
  command_id: string;
  project_id: string;
  base_revision: number;
  actor_session_id?: string;
  kind: "capability" | "system";
  capability_id?: string;
  params?: Record<string, unknown>;
  source?: CommandSource;
  proposed_manifest?: RenderManifest | null;
  base_snapshot_hash?: string | null;
  system_op?: string;
}

function newCommandId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

export async function createStudioProject(opts: {
  title?: string;
  primary_asset_id?: string | null;
  active_run_id?: string | null;
  proposed_manifest?: RenderManifest | null;
}): Promise<{ project_id: string; revision: number; snapshot_hash: string | null }> {
  const { data } = await axios.post(`${API_URL}/api/studio/v1/projects`, {
    title: opts.title ?? "Untitled",
    primary_asset_id: opts.primary_asset_id ?? null,
    active_run_id: opts.active_run_id ?? null,
    proposed_manifest: opts.proposed_manifest ?? null,
  });
  return {
    project_id: data.project_id as string,
    revision: data.revision as number,
    snapshot_hash: (data.snapshot_hash as string | null) ?? null,
  };
}

export async function fetchStudioHead(projectId: string): Promise<StudioProjectHead> {
  const { data } = await axios.get<StudioProjectHead>(
    `${API_URL}/api/studio/v1/projects/${projectId}/head`,
  );
  return data;
}

export async function ensureStudioProject(opts?: {
  title?: string;
  active_run_id?: string | null;
  proposed_manifest?: RenderManifest | null;
}): Promise<string> {
  const { useEditorStore } = await import("@/stores/editorStore");
  const state = useEditorStore.getState();
  if (state.studioProjectId) return state.studioProjectId;
  const created = await createStudioProject({
    title: opts?.title ?? "Studio Project",
    active_run_id: opts?.active_run_id ?? state.runId,
    proposed_manifest: opts?.proposed_manifest ?? null,
  });
  useEditorStore.setState({
    studioProjectId: created.project_id,
    studioAckedRevision: created.revision,
    studioSnapshotHash: created.snapshot_hash,
  });
  return created.project_id;
}

export async function postStudioCommand(
  body: ProjectCommandBody,
): Promise<CommandAck> {
  try {
    const { data } = await axios.post<CommandAck>(
      `${API_URL}/api/studio/v1/projects/${body.project_id}/commands`,
      body,
    );
    return data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.data?.detail) {
      const detail = err.response.data.detail;
      if (typeof detail === "object" && detail?.status === "rejected") {
        throw Object.assign(new Error(detail.detail || "command_rejected"), {
          reject: detail as CommandRejectDetail,
        });
      }
    }
    throw err;
  }
}

/** Commit a capability with Strategy A proposed_manifest. */
export async function commitCapability(opts: {
  projectId: string;
  baseRevision: number;
  baseSnapshotHash?: string | null;
  capabilityId: string;
  params?: Record<string, unknown>;
  proposedManifest: RenderManifest;
  source?: CommandSource;
  actorSessionId?: string;
}): Promise<CommandAck> {
  return postStudioCommand({
    command_id: newCommandId(),
    project_id: opts.projectId,
    base_revision: opts.baseRevision,
    actor_session_id: opts.actorSessionId ?? "",
    kind: "capability",
    capability_id: opts.capabilityId,
    params: opts.params ?? {},
    source: opts.source ?? "ui_direct",
    proposed_manifest: opts.proposedManifest,
    base_snapshot_hash: opts.baseSnapshotHash ?? null,
  });
}

export { newCommandId };
