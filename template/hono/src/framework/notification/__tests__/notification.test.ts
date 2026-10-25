import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { notify } from "@/framework/notification/index.js";
import type {
  NotifiableTarget,
  NotificationCreateInput,
  NotificationProvider,
  NotificationRecord
} from "@/framework/providers/contracts.js";
import { loadProviders } from "@/framework/providers/loader.js";
import { clearNotificationProvider, registerNotificationProvider } from "@/framework/providers/registry.js";

/**
 * `notify()` is the only notification API an application calls. These tests pin
 * the two guarantees it makes regardless of the storage provider:
 *
 *  - a numeric id and a string id (UUID, ULID, ...) both become a stable
 *    `{ type, id }` target, so replacing auth does not change notification code
 *  - a missing provider is reported once and skipped, never thrown
 */

type ProviderCall = { target: NotifiableTarget; input: NotificationCreateInput };

/** A provider that records what the runtime asked it to store. */
function recordingProvider() {
  const calls: ProviderCall[] = [];
  const provider: NotificationProvider = {
    create: async (target, input): Promise<NotificationRecord> => {
      calls.push({ target, input });
      return {
        id: `n-${calls.length}`,
        notifiableType: String(target.type || "user"),
        notifiableId: String(target.id),
        type: input.type || "info",
        title: input.title,
        body: input.body ?? null,
        data: input.data ?? null,
        link: input.link ?? null,
        readAt: null,
        createdAt: new Date(0).toISOString()
      };
    },
    list: async () => ({ data: [], total: 0, unread: 0, page: 1, perPage: 20 }),
    unreadCount: async () => 0,
    markRead: async () => false,
    markAllRead: async () => 0,
    remove: async () => false
  };
  return { provider, calls };
}

beforeAll(async () => {
  // Let provider discovery run once, then every test registers its own provider.
  // Otherwise the shipped default provider would replace the fake mid-test.
  await loadProviders();
});

afterEach(() => {
  clearNotificationProvider();
});

describe("notify", () => {
  it("maps a numeric id to the default user target", async () => {
    const { provider, calls } = recordingProvider();
    registerNotificationProvider(provider);

    const record = await notify(42, { title: "Hello" });

    expect(calls).toEqual([{ target: { type: "user", id: 42 }, input: expect.objectContaining({ title: "Hello" }) }]);
    expect(record?.notifiableId).toBe("42");
  });

  it("passes a string id through unchanged, so UUID owner ids work", async () => {
    const { provider, calls } = recordingProvider();
    registerNotificationProvider(provider);
    const id = "9b2f6f2e-4a9c-4a0e-9f1d-3f6a1c2b3d4e";

    await notify(id, { title: "Hello" });

    expect(calls[0].target).toEqual({ type: "user", id });
  });

  it("keeps an explicit notifiable type instead of forcing user", async () => {
    const { provider, calls } = recordingProvider();
    registerNotificationProvider(provider);

    await notify({ type: "team", id: 7 }, { title: "Hello" });

    expect(calls[0].target).toEqual({ type: "team", id: 7 });
  });

  it("forwards the notification fields to the provider", async () => {
    const { provider, calls } = recordingProvider();
    registerNotificationProvider(provider);

    await notify(1, {
      type: "invoice",
      title: "Invoice paid",
      body: "Thanks",
      link: "/invoices/1",
      data: { invoiceId: 1 }
    });

    expect(calls[0].input).toEqual({
      type: "invoice",
      title: "Invoice paid",
      body: "Thanks",
      link: "/invoices/1",
      data: { invoiceId: 1 }
    });
  });

  it("warns once and returns null when no provider is registered", async () => {
    vi.resetModules();
    vi.doMock("@/framework/providers/adapter.js", () => ({
      resolveAuthProvider: async () => null,
      resolveNotificationProvider: async () => null
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const { notify: isolatedNotify } = await import("@/framework/notification/index.js");

      expect(await isolatedNotify(1, { title: "first" })).toBe(null);
      expect(await isolatedNotify(2, { title: "second" })).toBe(null);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
      vi.doUnmock("@/framework/providers/adapter.js");
      vi.resetModules();
    }
  });
});
