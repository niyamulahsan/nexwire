import { dispatchEvent } from "@/framework/events/dispatcher.js";
import { resolveAuthProvider, resolveNotificationProvider } from "@/framework/providers/adapter.js";
import type { NotifiableTarget, NotificationRecord } from "@/framework/providers/contracts.js";
import { redisClientIfReady } from "@/framework/redis/client.js";
import { mail } from "@/framework/support/mail.js";

let missingProviderWarned = false;

/** A numeric id (default auth), a string id (UUID/ULID), or an explicit target. */
export type NotificationTarget = number | string | NotifiableTarget;

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
    /** Explicit recipient. Skips the auth provider contact lookup. */
    to?: string;
    subject?: string;
    html?: string;
  };
};

/** Turn the public target argument into the polymorphic owner pair. */
function normalizeTarget(target: NotificationTarget): Required<Pick<NotifiableTarget, "id">> & { type: string } {
  if (target !== null && typeof target === "object") {
    return {
      type: String(target.type || "user").trim() || "user",
      id: target.id
    };
  }
  return { type: "user", id: target as number | string };
}

/**
 * Why: Persists a notification through the registered provider.
 * When: A feature wants to record something for a user (or another notifiable).
 * Where: Application code, through the framework facade.
 * How: The provider owns storage; broadcasting and email stay here so a custom
 *      store cannot silently disable them. A missing provider is reported once
 *      and returns `null` instead of throwing, matching the framework's
 *      "optional module" behaviour.
 */
export async function notify(target: NotificationTarget, options: NotificationOptions): Promise<NotificationRecord | null> {
  const provider = await resolveNotificationProvider();
  if (!provider) {
    if (!missingProviderWarned) {
      missingProviderWarned = true;
      console.warn(
        "[notification] skipped: no notification provider is registered. Keep src/modules/notification or register one in src/providers/."
      );
    }
    return null;
  }

  const normalizedTarget = normalizeTarget(target);
  const normalized = await provider.create(normalizedTarget, {
    type: options.type,
    title: options.title,
    body: options.body ?? null,
    link: options.link ?? null,
    data: options.data ?? null
  });

  if (options.broadcast) {
    await dispatchEvent("notification.created", normalized, {
      broadcast: { users: [normalizedTarget.id] }
    });
  }

  if (options.mail) {
    await sendMailChannel(normalizedTarget, normalized, options);
  }

  return normalized;
}

/** Deliver an email notification, either queued (if Redis is available) or direct. */
async function sendMailChannel(
  target: { type: string; id: number | string },
  notification: NotificationRecord,
  options: NotificationOptions
) {
  let to: string | null = options.mail?.to || null;

  if (!to) {
    try {
      const provider = await resolveAuthProvider();
      if (provider?.getUserContact) {
        const contact = await provider.getUserContact(target.id);
        if (contact?.email) to = contact.email as string;
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
