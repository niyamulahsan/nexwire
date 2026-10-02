import { eq } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { auths } from "@/modules/auth/database/models/auth.js";

/**
 * Why: Returns every auth row for list screens.
 * When: Called by the controller's index() handler.
 * Where: GET /auth route.
 */
export async function list() {
  return db.select().from(auths);
}

/**
 * Why: Returns one auth row by primary key.
 * When: Called by the controller's show/update/destroy handlers.
 * Where: Reused across GET/PUT/DELETE /auth/{id} routes.
 */
export async function findOne(id: number) {
  const [row] = await db.select().from(auths).where(eq(auths.id, id)).limit(1);
  return row ?? null;
}

/**
 * Why: Persists a new auth row.
 * When: Called by the controller's store() handler.
 * Where: POST /auth route.
 */
export async function create(data: Record<string, unknown>) {
  const [row] = await db.insert(auths).values(data).returning();
  return row;
}

/**
 * Why: Applies a partial change to one auth row.
 * When: Called by the controller's update() handler.
 * Where: PUT/PATCH /auth/{id} route.
 */
export async function update(id: number, data: Record<string, unknown>) {
  const [row] = await db
    .update(auths)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(auths.id, id))
    .returning();
  return row ?? null;
}

/**
 * Why: Removes one auth row.
 * When: Called by the controller's destroy() handler.
 * Where: DELETE /auth/{id} route.
 */
export async function remove(id: number) {
  const [row] = await db.delete(auths).where(eq(auths.id, id)).returning();
  return row ?? null;
}