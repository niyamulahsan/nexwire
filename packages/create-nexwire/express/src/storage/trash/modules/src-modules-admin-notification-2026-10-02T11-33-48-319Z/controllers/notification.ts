import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Request, Response } from "express";
import { db } from "@/framework/facade.js";
import { notifications } from "@/modules/auth/database/models/notifications.js";

type AuthRequest = Request & { auth: { id: number } };

export const list = async (req: AuthRequest, res: Response) => {
  const userId = req.auth.id;
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(50, Math.max(1, Number(req.query.perPage) || 20));

  const unread = await db.select({ count: count() }).from(notifications)
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} IS NULL`));
  const total = await db.select({ count: count() }).from(notifications)
    .where(eq(notifications.userId, userId));
  const rows = await db.select().from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  res.json({
    data: rows.map(normalize),
    total: total[0].count,
    unread: unread[0].count,
    page,
    perPage
  });
};

export const unreadCount = async (req: AuthRequest, res: Response) => {
  const userId = req.auth.id;
  const rows = await db.select({ count: count() }).from(notifications)
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} IS NULL`));
  res.json({ count: rows[0].count });
};

export const markRead = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  await db.update(notifications)
    .set({ readAt: sql`now()` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, req.auth.id)));
  res.json({ ok: true });
};

export const markAllRead = async (req: AuthRequest, res: Response) => {
  await db.update(notifications)
    .set({ readAt: sql`now()` })
    .where(and(eq(notifications.userId, req.auth.id), sql`${notifications.readAt} IS NULL`));
  res.json({ ok: true });
};

export const remove = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  await db.delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, req.auth.id)));
  res.json({ ok: true });
};

function normalize(row: typeof notifications.$inferSelect) {
  let parsed: unknown = null;
  if (row.data) {
    try { parsed = JSON.parse(row.data); } catch {}
  }
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    body: row.body,
    data: parsed,
    link: row.link,
    readAt: row.readAt?.toISOString() || null,
    createdAt: row.createdAt.toISOString(),
  };
}
