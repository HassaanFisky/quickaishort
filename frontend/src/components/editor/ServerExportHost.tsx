"use client";

/**
 * Always-mounted owner of Cloud Tasks server export.
 * Chat-primary mode has no RightPanel — without this host, qai:export is a no-op.
 */

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useServerExport } from "@/hooks/useServerExport";
import { useEditorStore } from "@/stores/editorStore";
import { useServerExportStore } from "@/stores/serverExportStore";
import { qaiLoopLog } from "@/lib/qaiLoopDebug";

export default function ServerExportHost() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";
  const {
    exportClip,
    cancelExport,
    isExporting,
    exportProgress,
    exportDone,
    exportError,
    lastDownloadUrl,
    activeJobId,
    resetExportState,
  } = useServerExport({ userId });

  const setSnapshot = useServerExportStore((s) => s.setSnapshot);
  const setControllers = useServerExportStore((s) => s.setControllers);

  useEffect(() => {
    setSnapshot({
      isExporting,
      exportProgress,
      activeJobId,
      exportError,
      exportDone,
      lastDownloadUrl,
    });
  }, [
    isExporting,
    exportProgress,
    activeJobId,
    exportError,
    exportDone,
    lastDownloadUrl,
    setSnapshot,
  ]);

  useEffect(() => {
    // #region agent log
    qaiLoopLog("B", "ServerExportHost.tsx:setControllers", "effect", {
      runId: "post-fix",
    });
    // #endregion
    setControllers({ cancelExport, resetExportState });
  }, [cancelExport, resetExportState, setControllers]);

  useEffect(() => {
    const onExport = () => {
      if (isExporting) return;
      const st = useEditorStore.getState();
      if (!(st.sourceFile || st.sourceUrl)) return;
      void exportClip({
        quality: st.exportSettings.quality,
        captionsEnabled: st.captionsEnabled,
      });
    };
    window.addEventListener("qai:export", onExport);
    return () => window.removeEventListener("qai:export", onExport);
  }, [exportClip, isExporting]);

  return null;
}
