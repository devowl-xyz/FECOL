import { Router } from "express";
import { db, gestureMappingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateGestureBody,
  DeleteGestureParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/gestures", async (req, res) => {
  const rows = await db.select().from(gestureMappingsTable).orderBy(gestureMappingsTable.createdAt);
  const result = rows.map((r) => ({
    id: r.id,
    name: r.name,
    action: r.action,
    description: r.description ?? undefined,
    createdAt: r.createdAt.toISOString(),
  }));
  res.json(result);
});

router.post("/gestures", async (req, res) => {
  const parsed = CreateGestureBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }
  const { name, action, description } = parsed.data;
  const [row] = await db
    .insert(gestureMappingsTable)
    .values({ name, action, description: description ?? null })
    .returning();
  res.status(201).json({
    id: row.id,
    name: row.name,
    action: row.action,
    description: row.description ?? undefined,
    createdAt: row.createdAt.toISOString(),
  });
});

router.delete("/gestures/:id", async (req, res) => {
  const parsed = DeleteGestureParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(gestureMappingsTable).where(eq(gestureMappingsTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
