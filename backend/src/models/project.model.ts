import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./user.model.js";

export const projectStatusEnum = pgEnum("project_status", [
  "draft",
  "processing",
  "completed",
  "failed",
]);

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").default("Untitled Project").notNull(),
  sourceUrl: text("source_url"),
  r2VideoKey: text("r2_video_key"),
  thumbnail: text("thumbnail"),
  duration: integer("duration"),
  timelineData: jsonb("timeline_data")
    .default({ clips: [], textLayers: [], audioTracks: [] })
    .notNull(),
  status: projectStatusEnum("status").default("draft").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
