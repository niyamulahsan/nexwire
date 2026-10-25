import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NotificationProvider } from "@/framework/providers/contracts.js";
import {
  clearAuthProvider,
  clearNotificationProvider,
  clearProvider,
  getAuthProvider,
  getNotificationProvider,
  getProvider,
  hasAuthProvider,
  hasNotificationProvider,
  hasProvider,
  listProviders,
  registerAuthProvider,
  registerNotificationProvider,
  registerProvider
} from "@/framework/providers/registry.js";

/** Minimal store implementation: the registry only cares that a contract is filled. */
const notificationProvider: NotificationProvider = {
  create: async () => ({
    id: "1",
    notifiableType: "user",
    notifiableId: "1",
    type: "info",
    title: "Hello",
    body: null,
    data: null,
    link: null,
    readAt: null,
    createdAt: new Date(0).toISOString()
  }),
  list: async () => ({ data: [], total: 0, unread: 0, page: 1, perPage: 20 }),
  unreadCount: async () => 0,
  markRead: async () => false,
  markAllRead: async () => 0,
  remove: async () => false
};

/**
 * The provider system is the framework's public extension point, so these
 * tests cover the two promises it makes to an application:
 *
 *  - registering an implementation is enough for the framework to use it
 *  - a file dropped into `src/providers/` is imported without any wiring
 */
describe("provider registry", () => {
  afterEach(() => {
    clearProvider("payment");
    clearAuthProvider();
    clearNotificationProvider();
  });

  it("registers and reads any implementation by key", () => {
    const implementation = { charge: async () => "ok" };

    registerProvider("payment", implementation);

    expect(getProvider("payment")).toBe(implementation);
    expect(hasProvider("payment")).toBe(true);
    expect(listProviders()).toContain("payment");
  });

  it("returns null for a key that was never registered", () => {
    expect(getProvider("never-registered")).toBe(null);
    expect(hasProvider("never-registered")).toBe(false);
  });

  it("clears a registered implementation", () => {
    registerProvider("payment", { charge: async () => "ok" });

    clearProvider("payment");

    expect(getProvider("payment")).toBe(null);
    expect(hasProvider("payment")).toBe(false);
  });

  it("registers the auth provider under the auth key", () => {
    const provider = {
      getUserById: async () => null,
      findRefreshToken: async () => null
    };

    registerAuthProvider(provider);

    expect(getAuthProvider()).toBe(provider);
    expect(hasAuthProvider()).toBe(true);
  });

  it("clears the auth provider", () => {
    registerAuthProvider({
      getUserById: async () => null,
      findRefreshToken: async () => null
    });

    clearAuthProvider();

    expect(getAuthProvider()).toBe(null);
    expect(hasAuthProvider()).toBe(false);
  });

  it("registers the notification provider under the notification key", () => {
    registerNotificationProvider(notificationProvider);

    expect(getNotificationProvider()).toBe(notificationProvider);
    expect(hasNotificationProvider()).toBe(true);
  });

  it("clears the notification provider", () => {
    registerNotificationProvider(notificationProvider);

    clearNotificationProvider();

    expect(getNotificationProvider()).toBe(null);
    expect(hasNotificationProvider()).toBe(false);
  });
});

describe("provider loader", () => {
  const providersDir = path.resolve(process.cwd(), "src/providers");
  const fixture = path.join(providersDir, "__loader-fixture.ts");
  const moduleFixtureDir = path.resolve(process.cwd(), "src/modules/__loader-fixture-module/providers");
  const moduleFixture = path.join(moduleFixtureDir, "__loader-fixture.ts");

  afterEach(async () => {
    await rm(fixture, { force: true });
    await rm(path.resolve(process.cwd(), "src/modules/__loader-fixture-module"), { recursive: true, force: true });
    delete (globalThis as any).__nexwireProviderFixture;
    vi.resetModules();
  });

  it("imports a provider file dropped into src/providers without any wiring", async () => {
    await mkdir(providersDir, { recursive: true });
    await writeFile(fixture, "globalThis.__nexwireProviderFixture = true;\n", "utf8");

    vi.resetModules();
    const loader = await import("@/framework/providers/loader.js");

    const loaded = await loader.loadProviders();

    expect(loaded).toBeGreaterThan(0);
    expect((globalThis as any).__nexwireProviderFixture).toBe(true);
  });

  it("imports a provider file dropped into a module's providers folder", async () => {
    // A module offers its implementation to the whole app the same way the app
    // does: by dropping a file where the loader looks for it.
    await mkdir(moduleFixtureDir, { recursive: true });
    await writeFile(moduleFixture, "globalThis.__nexwireProviderFixture = true;\n", "utf8");

    vi.resetModules();
    const loader = await import("@/framework/providers/loader.js");

    await loader.loadProviders();

    expect((globalThis as any).__nexwireProviderFixture).toBe(true);
  });

  it("loads providers only once", async () => {
    vi.resetModules();
    const loader = await import("@/framework/providers/loader.js");

    const first = await loader.loadProviders();
    const second = await loader.loadProviders();

    expect(second).toBe(first);
  });
});
