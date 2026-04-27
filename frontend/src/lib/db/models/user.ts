import { Schema, model, models } from "mongoose";

const UserSchema = new Schema({
  googleId: { type: String, unique: true, sparse: true },
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  image: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: Date.now },
  settings: {
    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "system",
    },
    defaultAspectRatio: {
      type: String,
      enum: ["9:16", "1:1"],
      default: "9:16",
    },
    defaultQuality: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    captionPreset: { type: String, default: "default" },
    whisperModel: {
      type: String,
      enum: ["tiny", "base", "small"],
      default: "base",
    },
  },
  stats: {
    totalProjects: { type: Number, default: 0 },
    totalExports: { type: Number, default: 0 },
    totalProcessingTimeMs: { type: Number, default: 0 },
  },
});

const User = models.User || model("User", UserSchema);
export default User;
