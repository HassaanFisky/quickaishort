import { RenderManifest } from "../render/renderManifest";
import { FrameFilter, Caption, ExportSettings } from "@/stores/editorStore";
import { validateRenderManifest } from "../render/compileRenderManifest";

export interface ManifestExportContext {
  frameFilters: FrameFilter;
  captions: Caption[];
  exportFilterPreset: ExportSettings["filter"];
}

const DEFAULT_FRAME_FILTERS: FrameFilter = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  blur: 0,
  chromaKeyEnabled: false,
  chromaKeyColor: "#00FF00",
  chromaKeyTolerance: 0.3,
  chromaKeySoftness: 0.1,
  chromaKeySpill: 0.5,
  cropTop: 0,
  cropBottom: 0,
  cropLeft: 0,
  cropRight: 0,
  panX: 0,
  panY: 0,
  opacity: 1,
  backgroundRemoveEnabled: false,
};

export function getExportContextFromManifest(manifest: RenderManifest | null): ManifestExportContext {
  if (!manifest) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ExportContext] Manifest is null. Using default context.");
    }
    return {
      frameFilters: { ...DEFAULT_FRAME_FILTERS },
      captions: [],
      exportFilterPreset: "None",
    };
  }

  const errors = validateRenderManifest(manifest);
  if (errors.length > 0 && process.env.NODE_ENV !== "production") {
    console.warn("[ExportContext] Manifest validation warnings:", errors);
  }

  const frameFilterEffect = manifest.effects.find((e) => e.type === "frame_filter");
  const frameFilters = frameFilterEffect?.payload
    ? (frameFilterEffect.payload as unknown as FrameFilter)
    : { ...DEFAULT_FRAME_FILTERS };

  const exportSettingsEffect = manifest.effects.find((e) => e.type === "export_settings");
  const exportFilterPreset = exportSettingsEffect?.payload
    ? ((exportSettingsEffect.payload as unknown as ExportSettings).filter)
    : "None";

  const captions: Caption[] = manifest.captions.map((c) => ({
    id: c.id,
    text: c.text,
    startTime: c.startTime,
    endTime: c.endTime,
    style: c.style as any,
  }));

  return {
    frameFilters,
    captions,
    exportFilterPreset,
  };
}
