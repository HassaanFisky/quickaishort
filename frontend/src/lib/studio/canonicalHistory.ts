/**
 * Canonical Studio history projector.
 *
 * Server ProjectKernel revisions are authoritative. Client undo/ai stacks
 * are interaction projections and must not silently fork project state.
 */

import { useEditorStore, type AiSnapshot } from "@/stores/editorStore";
import {
  commitSystemOp,
  isStudioProjectKernelEnabled,
  type CommandAck,
} from "@/lib/studio/projectKernel";
import type { RenderManifest } from "@/lib/render/renderManifest";

function cloneJson<T>(value: T): T {
  if (typeof structuredClone !== "undefined") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function captureEditorProjection(label = "revision"): AiSnapshot {
  const s = useEditorStore.getState();
  return {
    label,
    timestamp: Date.now(),
    elements: cloneJson(s.elements),
    selectedElementId: s.selectedElementId,
    captions: cloneJson(s.captions),
    trimMarker: s.trimMarker ? { ...s.trimMarker } : null,
    frameFilters: { ...s.frameFilters },
    exportSettings: { ...s.exportSettings },
    captionsEnabled: s.captionsEnabled,
    currentTime: s.currentTime,
  };
}

export function applyEditorProjection(snapshot: AiSnapshot): void {
  useEditorStore.setState({
    elements: snapshot.elements,
    selectedElementId: snapshot.selectedElementId,
    captions: snapshot.captions,
    trimMarker: snapshot.trimMarker,
    frameFilters: snapshot.frameFilters,
    exportSettings: snapshot.exportSettings,
    captionsEnabled: snapshot.captionsEnabled,
    currentTime: snapshot.currentTime,
  });
}

export function applyKernelAck(ack: CommandAck, opts?: { recordProjection?: boolean }): void {
  const hash = ack.snapshot_hash ?? null;
  const patch: Record<string, unknown> = {
    studioAckedRevision: ack.new_revision,
    studioSnapshotHash: hash,
    studioUndoDepth: ack.undo_depth ?? 0,
    studioRedoDepth: ack.redo_depth ?? 0,
  };
  if (ack.snapshot_manifest) {
    patch.compiledManifest = ack.snapshot_manifest;
  }
  if (opts?.recordProjection !== false && hash) {
    const current = useEditorStore.getState().studioProjectionByHash;
    patch.studioProjectionByHash = {
      ...current,
      [hash]: captureEditorProjection(`r${ack.new_revision}`),
    };
  }
  useEditorStore.setState(patch);
}

export function restoreProjectionForAck(ack: CommandAck): void {
  const hash = ack.snapshot_hash;
  if (!hash) {
    applyKernelAck(ack, { recordProjection: false });
    return;
  }
  const projection = useEditorStore.getState().studioProjectionByHash[hash];
  applyKernelAck(ack, { recordProjection: false });
  if (projection) {
    applyEditorProjection(projection);
  }
}

export async function undoCanonicalHistory(): Promise<boolean> {
  const state = useEditorStore.getState();
  if (isStudioProjectKernelEnabled() && state.studioProjectId) {
    if ((state.studioUndoDepth ?? 0) <= 0) return false;
    const ack = await commitSystemOp({
      projectId: state.studioProjectId,
      baseRevision: state.studioAckedRevision,
      systemOp: "undo",
      baseSnapshotHash: state.studioSnapshotHash,
    });
    restoreProjectionForAck(ack);
    return true;
  }
  if (state.undoStack.length === 0) return false;
  state.undo();
  return true;
}

export async function redoCanonicalHistory(): Promise<boolean> {
  const state = useEditorStore.getState();
  if (isStudioProjectKernelEnabled() && state.studioProjectId) {
    if ((state.studioRedoDepth ?? 0) <= 0) return false;
    const ack = await commitSystemOp({
      projectId: state.studioProjectId,
      baseRevision: state.studioAckedRevision,
      systemOp: "redo",
      baseSnapshotHash: state.studioSnapshotHash,
    });
    restoreProjectionForAck(ack);
    return true;
  }
  if (state.redoStack.length === 0) return false;
  state.redo();
  return true;
}

export async function commitManualSnapshotIfNeeded(
  manifest?: RenderManifest | null,
): Promise<number | null> {
  if (!isStudioProjectKernelEnabled()) return null;
  const state = useEditorStore.getState();
  const projectId = state.studioProjectId;
  const proposed = manifest ?? state.compiledManifest;
  if (!projectId || !proposed) return state.studioAckedRevision;
  const ack = await commitSystemOp({
    projectId,
    baseRevision: state.studioAckedRevision,
    systemOp: "commit_snapshot",
    proposedManifest: proposed,
    baseSnapshotHash: state.studioSnapshotHash,
  });
  applyKernelAck(ack);
  return ack.new_revision;
}
