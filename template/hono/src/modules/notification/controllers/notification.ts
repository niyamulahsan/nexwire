import type { Handler } from "hono";
import { HttpStatusCodes, resolveNotificationProvider } from "@/framework/facade.js";
import type { NotifiableTarget } from "@/framework/providers/contracts.js";

/** Read the authenticated owner. A missing auth context means the request is anonymous. */
function targetFrom(c: any): NotifiableTarget | null {
  const auth = c.get("auth");
  if (!auth || auth.id === undefined || auth.id === null) return null;
  return { type: "user", id: auth.id };
}

export const list: Handler = async (c: any) => {
  const provider = await resolveNotificationProvider();
  if (!provider) {
    return c.json(
      { message: "Notification provider not available. Restore src/modules/notification or register one in src/providers/." },
      HttpStatusCodes.SERVICE_UNAVAILABLE
    );
  }

  const target = targetFrom(c);
  if (!target) return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);

  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const perPage = Math.min(50, Math.max(1, Number(c.req.query("perPage")) || 20));

  return c.json(await provider.list(target, { page, perPage }));
};

export const unreadCount: Handler = async (c: any) => {
  const provider = await resolveNotificationProvider();
  if (!provider) {
    return c.json(
      { message: "Notification provider not available. Restore src/modules/notification or register one in src/providers/." },
      HttpStatusCodes.SERVICE_UNAVAILABLE
    );
  }

  const target = targetFrom(c);
  if (!target) return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);

  return c.json({ count: await provider.unreadCount(target) });
};

export const markRead: Handler = async (c: any) => {
  const provider = await resolveNotificationProvider();
  if (!provider) {
    return c.json(
      { message: "Notification provider not available. Restore src/modules/notification or register one in src/providers/." },
      HttpStatusCodes.SERVICE_UNAVAILABLE
    );
  }

  const target = targetFrom(c);
  if (!target) return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);

  await provider.markRead(target, c.req.param("id"));
  return c.json({ ok: true });
};

export const markAllRead: Handler = async (c: any) => {
  const provider = await resolveNotificationProvider();
  if (!provider) {
    return c.json(
      { message: "Notification provider not available. Restore src/modules/notification or register one in src/providers/." },
      HttpStatusCodes.SERVICE_UNAVAILABLE
    );
  }

  const target = targetFrom(c);
  if (!target) return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);

  await provider.markAllRead(target);
  return c.json({ ok: true });
};

export const remove: Handler = async (c: any) => {
  const provider = await resolveNotificationProvider();
  if (!provider) {
    return c.json(
      { message: "Notification provider not available. Restore src/modules/notification or register one in src/providers/." },
      HttpStatusCodes.SERVICE_UNAVAILABLE
    );
  }

  const target = targetFrom(c);
  if (!target) return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);

  await provider.remove(target, c.req.param("id"));
  return c.json({ ok: true });
};
