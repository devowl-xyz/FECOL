import { Router } from "express";
import { db, sessionsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import {
  CreateSessionBody,
  GetSessionParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/sessions", async (req, res) => {
  const rows = await db
    .select()
    .from(sessionsTable)
    .orderBy(desc(sessionsTable.createdAt))
    .limit(50);
  const result = rows.map((r) => ({
    id: r.id,
    label: r.label,
    gestureCount: r.gestureCount,
    durationSeconds: r.durationSeconds,
    createdAt: r.createdAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
  }));
  res.json(result);
});

router.post("/sessions", async (req, res) => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }
  const [row] = await db
    .insert(sessionsTable)
    .values({ label: parsed.data.label })
    .returning();
  res.status(201).json({
    id: row.id,
    label: row.label,
    gestureCount: row.gestureCount,
    durationSeconds: row.durationSeconds,
    createdAt: row.createdAt.toISOString(),
    endedAt: null,
  });
});

router.get("/sessions/summary", async (req, res) => {
  const rows = await db.select().from(sessionsTable);
  const totalSessions = rows.length;
  const totalGestures = rows.reduce((sum, r) => sum + r.gestureCount, 0);
  const totalDurationSeconds = rows.reduce((sum, r) => sum + r.durationSeconds, 0);

  // Tally gesture counts from session labels (simplified)
  const gestureCounts: Record<string, number> = {};
  rows.forEach((r) => {
    const key = r.label || "unnamed";
    gestureCounts[key] = (gestureCounts[key] ?? 0) + r.gestureCount;
  });
  const topGestures = Object.entries(gestureCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  res.json({ totalSessions, totalGestures, totalDurationSeconds, topGestures });
});

router.get("/sessions/:id", async (req, res) => {
  const parsed = GetSessionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, parsed.data.id));
  if (!row) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const mapperGraph = (row.mapperGraph as { nodes: unknown[]; edges: unknown[] } | null) ?? { nodes: [], edges: [] };
  res.json({
    id: row.id,
    label: row.label,
    gestureCount: row.gestureCount,
    durationSeconds: row.durationSeconds,
    createdAt: row.createdAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    mapperGraph,
  });
});

export default router;
