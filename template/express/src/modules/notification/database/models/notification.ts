import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Why: Notifications are stored by a standalone module, not by auth.
 * When: `notify()` writes a row and `/api/notification/*` reads it back.
 * Where: `src/modules/notification/database/models/notification.ts`.
 * How: A polymorphic owner (`notifiable_type` + `notifiable_id`) with no
 *      foreign key, so deleting or replacing auth cannot cascade-delete
 *      notifications and a UUID or numeric owner id stores the same way.
 */
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    notifiableType: text("notifiable_type").notNull().default("user"),
    notifiableId: text("notifiable_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    data: text("data"),
    link: text("link"),
    readAt: integer("read_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull()
  },
  (table) => [
    index("notifications_notifiable_read_idx").on(table.notifiableType, table.notifiableId, table.readAt),
    index("notifications_notifiable_created_idx").on(table.notifiableType, table.notifiableId, table.createdAt)
  ]
);
