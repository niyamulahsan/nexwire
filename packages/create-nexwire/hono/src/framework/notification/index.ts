import { eq } from "drizzle-orm";
import { db } from "@/framework/database/connection.js";
import { dispatchEvent } from "@/framework/events/dispatcher.js";
import { redisClientIfReady } from "@/framework/redis/client.js";
import { mail } from "@/framework/support/mail.js";
import { notifications } from "@/modules/auth/database/models/notifications.js";
import { users } from "@/modules/auth/database/models/user.js";

/** Extra JSON metadata attached to the notification (e.g. entity IDs, links). */
export type NotificationOptions = {
  /** Notification category key (default: "info") */
  type?: string;
  /** Notification title */
  title: string;
  /** Notification body text */
  body?: string;
  /** Optional click-through URL */
  link?: string;
  /** Arbitrary JSON payload stored in `data` column */
  data?: Record<string, unknown>;
  /** Whether to broadcast the notification to the user's socket in realtime */
  broadcast?: boolean;
  /** Email delivery options */
  mail?: {
    subject?: string;
    html?: string;
  };
};

/** Create a notification and persist it to the database. Optionally broadcast via Socket.IO and/or send by email. */
export async function notify(userId: number, options: NotificationOptions) {
  const insertResult = await db.insert(notifications).values({
    userId,
    type: options.type || "info",
    title: options.title,
    body: options.body || null,
    link: options.link || null,
    data: options.data ? JSON.stringify(options.data) : null
  });

  const insertedId = Number((insertResult as any)[0]?.insertId ?? (insertResult as any).insertId);
  if (!insertedId) throw new Error("Failed to create notification");

  const [row] = await db.select().from(notifications).where(eq(notifications.id, insertedId));
  const normalized = normalize(row);

  if (options.broadcast) {
    await dispatchEvent("notification.created", normalized, {
      broadcast: { users: [userId] }
    });
  }

  if (options.mail) {
    await sendMailChannel(userId, normalized, options);
  }

  return normalized;
}

/** Deliver an email notification, either queued (if Redis is available) or direct. */
async function sendMailChannel(
  userId: number,
  notification: { id: number; title: string; body: string | null },
  options: NotificationOptions
) {
  const [user] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId));

  if (!user?.email) return;

  const subject = options.mail?.subject || notification.title;
  const html = options.mail?.html || defaultMailHtml(notification.title, notification.body);

  if (redisClientIfReady()) {
    await dispatchEvent(
      "notification:mail",
      {
        to: user.email,
        subject,
        html
      },
      { queue: "mail" }
    );
  } else {
    await mail.sendMail({ to: user.email, subject, html });
  }
}

/** Generate a basic HTML email body from title and body text. */
function defaultMailHtml(title: string, body: string | null) {
  return `<h2>${escapeHtml(title)}</h2>${body ? `<p>${escapeHtml(body)}</p>` : ""}`;
}

function escapeHtml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Convert a DB row into the normalized response shape, parsing the `data` JSON column. */
function normalize(row: typeof notifications.$inferSelect) {
  let parsed: unknown = null;
  if (row.data) {
    try {
      parsed = JSON.parse(row.data);
    } catch {}
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
    createdAt: row.createdAt.toISOString()
  };
}
