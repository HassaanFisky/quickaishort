/**
 * EP-002 — flagged Studio Project Kernel projector hook.
 * When NEXT_PUBLIC_STUDIO_PROJECT_KERNEL !== "1", all methods are no-ops.
 */

"use client";

import { useCallback } from "react";
import { useEditorStore } from "@/stores/editorStore";
import {
  commitCapability,
  createStudioProject,
  fetchStudioHead,
  isStudioProjectKernelEnabled,
  type CommandAck,
} from "@/lib/studio/projectKernel";
import type { RenderManifest } from "@/lib/render/renderManifest";

export function useStudioProjectKernel() {
  const enabled = isStudioProjectKernelEnabled();

  const ensureProject = useCallback(
    async (opts?: {
      title?: string;
      proposed_manifest?: RenderManifest | null;
    }): Promise<string | null> => {
      if (!enabled) return null;
      const state = useEditorStore.getState();
      if (state.studioProjectId) return state.studioProjectId;
      const created = await createStudioProject({
        title: opts?.title ?? "Studio Project",
        active_run_id: state.runId,
        proposed_manifest: opts?.proposed_manifest ?? null,
      });
      useEditorStore.setState({
        studioProjectId: created.project_id,
        studioAckedRevision: created.revision,
        studioSnapshotHash: created.snapshot_hash,
      });
      return created.project_id;
    },
    [enabled],
  );

  const reconcileFromServer = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    const id = useEditorStore.getState().studioProjectId;
    if (!id) return;
    const head = await fetchStudioHead(id);
    useEditorStore.setState({
      studioAckedRevision: head.revision,
      studioSnapshotHash: head.snapshot_hash,
    });
  }, [enabled]);

  const commitEdit = useCallback(
    async (opts: {
      capabilityId: string;
      proposedManifest: RenderManifest;
      params?: Record<string, unknown>;
      source?: "chat" | "ui_direct" | "orchestrator" | "automation";
    }): Promise<CommandAck | null> => {
      if (!enabled) return null;
      const projectId = await ensureProject({
        proposed_manifest: opts.proposedManifest,
      });
      if (!projectId) return null;
      const state = useEditorStore.getState();
      try {
        const ack = await commitCapability({
          projectId,
          baseRevision: state.studioAckedRevision,
          baseSnapshotHash: state.studioSnapshotHash,
          capabilityId: opts.capabilityId,
          proposedManifest: opts.proposedManifest,
          params: opts.params,
          source: opts.source ?? "ui_direct",
        });
        useEditorStore.setState({
          studioAckedRevision: ack.new_revision,
          studioSnapshotHash: ack.snapshot_hash ?? null,
        });
        return ack;
      } catch (err: unknown) {
        const reject = (err as { reject?: { reason?: string } })?.reject;
        if (reject?.reason === "conflict") {
          await reconcileFromServer();
        }
        throw err;
      }
    },
    [enabled, ensureProject, reconcileFromServer],
  );

  return {
    enabled,
    ensureProject,
    reconcileFromServer,
    commitEdit,
  };
}
