import { Schema, model, models } from "mongoose";

const ExportSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
  clipId: { type: String, required: true },

  settings: {
    aspectRatio: { type: String, enum: ["9:16", "1:1"] },
    quality: { type: String, enum: ["low", "medium", "high"] },
    captionsEnabled: { type: Boolean },
    captionPreset: { type: String },
    watermarkEnabled: { type: Boolean },
  },

  output: {
    filename: { type: String },
    filesize: { type: Number },
    duration: { type: Number },
    resolution: {
      width: { type: Number },
      height: { type: Number },
    },
  },

  metrics: {
    processingTimeMs: { type: Number },
    framesProcessed: { type: Number },
  },

  createdAt: { type: Date, default: Date.now },
});

const Export = models.Export || model("Export", ExportSchema);
export default Export;
