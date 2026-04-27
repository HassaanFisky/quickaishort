import { Schema, model, models } from "mongoose";

const ProjectSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

  source: {
    type: { type: String, enum: ["upload", "youtube", "url"], required: true },
    videoId: { type: String },
    filename: { type: String },
    url: { type: String },
    duration: { type: Number },
    resolution: {
      width: { type: Number },
      height: { type: Number },
    },
  },

  transcript: {
    segments: [Schema.Types.Mixed],
    language: { type: String },
    model: { type: String },
    processedAt: { type: Date },
  },

  analysis: {
    suggestions: [Schema.Types.Mixed],
    processedAt: { type: Date },
  },

  clips: [
    {
      id: { type: String },
      start: { type: Number },
      end: { type: Number },
      aspectRatio: { type: String, enum: ["9:16", "1:1"] },
      captions: {
        enabled: { type: Boolean, default: true },
        preset: { type: String, default: "default" },
      },
    },
  ],

  status: {
    type: String,
    enum: ["draft", "analyzed", "exported"],
    default: "draft",
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Project = models.Project || model("Project", ProjectSchema);
export default Project;
