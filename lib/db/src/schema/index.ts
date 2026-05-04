import { pgTable, text, serial, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gestureMappingsTable = pgTable("gesture_mappings", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  action: text("action").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGestureMappingSchema = createInsertSchema(gestureMappingsTable).omit({ id: true, createdAt: true });
export type InsertGestureMapping = z.infer<typeof insertGestureMappingSchema>;
export type GestureMapping = typeof gestureMappingsTable.$inferSelect;

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  gestureCount: integer("gesture_count").default(0).notNull(),
  durationSeconds: real("duration_seconds").default(0).notNull(),
  mapperGraph: jsonb("mapper_graph"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true, createdAt: true, gestureCount: true, durationSeconds: true, mapperGraph: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
