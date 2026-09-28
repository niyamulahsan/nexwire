import { relations } from "drizzle-orm";
import { int, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { users } from "@/modules/auth/database/models/user.js";

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id")
    .notNull()
    .references(() => users.id, { onUpdate: "cascade", onDelete: "cascade" }),
  type: varchar("type", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  data: text("data"),
  link: varchar("link", { length: 500 }),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id]
  })
}));
