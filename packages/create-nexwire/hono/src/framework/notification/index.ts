import { eq } from "drizzle-orm";
import { db } from "@/framework/database/connection.js";
import { dispatchEvent } from "@/framework/events/dispatcher.js";
import { redisClientIfReady } from "@/framework/redis/client.js";
import { mail } from "@/framework/support/mail.js";
import { resolveAuthProvider } from "@/framework/auth/adapter.js";

let notifications: any = null;
let modelsLoaded = false;
let modelsLoadAttempted = false;

async function loadNotificationModel() {
  if (modelsLoaded) return true;
  if (modelsLoadAttempted) return false;
  modelsLoadAttempted = true;
  try {
    const notificationMod = await import("@/modules/auth/database/models/notification.js").catch(() => null);
    if (notificationMod?.notifications) notifications = notificationMod.notifications;
    modelsLoaded = !!notifications;
    return modelsLoaded;
  } catch {
    return false;
  }
}

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
  const ok = await loadNotificationModel();
  if (!ok || !notifications) {
    console.warn("[notification] skipped: notification model not available (@/modules/auth/database/models/notification.js). Delete or replace auth/notification without breaking framework.");
    return null;
  }
  const insertResult = await db.insert(notifications).values({
    userId,
    type: options.type || "info",
    title: options.title,
    body: options.body || null,
    link: options.link || null,
    data: options.data ? JSON.stringify(options.data) : null
  });

  const insertedId = Number((insertResult as any)[0]?.insertId ?? (insertResult as any).insertId ?? (insertResult as any).lastInsertRowid);
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
  let to: string | null = (options.mail as any)?.to || null;
  let name: string | null = null;

  if (!to) {
    try {
      const provider = await resolveAuthProvider();
      if (provider?.getUserContact) {
        const contact = await provider.getUserContact(userId);
        if (contact?.email) {
          to = contact.email as string;
          name = (contact.name as string) || null;
        }
      }
    } catch {}
  }

  if (!to) {
    try {
      const userMod = await import("@/modules/auth/database/models/user.js").catch(() => null);
      if (userMod?.users) {
        const [user] = await db.select({ email: userMod.users.email, name: (userMod.users as any).name }).from(userMod.users).where(eq(userMod.users.id, userId));
        if (user?.email) {
          to = user.email as string;
          name = (user as any).name || null;
        }
      }
    } catch {}
  }

  if (!to) return;

  const subject = options.mail?.subject || notification.title;
  const html = options.mail?.html || defaultMailHtml(notification.title, notification.body);

  if (redisClientIfReady()) {
    await dispatchEvent(
      "notification:mail",
      {
        to,
        subject,
        html
      },
      { queue: "mail" }
    );
  } else {
    await mail.sendMail({ to, subject, html });
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
function normalize(row: any) {
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
