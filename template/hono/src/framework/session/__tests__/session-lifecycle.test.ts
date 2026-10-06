import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cross-request bleed tests for session.ts.
 *
 * The bug class: session data stored without namespacing or TTL causes
 * one user's session to bleed into another's. The session store must
 * isolate per sessionId, never leak data between ids, and handle
 * Redis-unavailable gracefully.
 */

const state = vi.hoisted(() => ({
  redisReady: true,
  store: new Map<string, string>(),
}));

vi.mock("@/config/index.js", () => ({
  get sessionConfig() {
    return { cookieName: "nexwire_session", keyPrefix: "nexwire:session", ttlSeconds: 3600 };
  },
  get appConfig() {
    return { url: "http://localhost:3000", frontendUrl: "http://localhost:5173" };
  },
  get redisConfig() {
    return { enabled: state.redisReady, prefix: "nexwire" };
  },
}));

vi.mock("@/framework/redis/client.js", () => ({
  redisClientIfReady: () =>
    state.redisReady
      ? {
          get: vi.fn(async (key: string) => state.store.get(key) ?? null),
          set: vi.fn(async (key: string, val: string) => state.store.set(key, val)),
          del: vi.fn(async (key: string) => state.store.delete(key)),
          expire: vi.fn(async () => 1),
        }
      : null,
}));

vi.mock("hono/cookie", () => ({
  getCookie: vi.fn(() => undefined),
  setCookie: vi.fn(),
}));

async function loadSession() {
  vi.resetModules();
  return import("@/framework/session/session.js");
}

beforeEach(() => {
  state.redisReady = true;
  state.store.clear();
});

describe("session store isolation", () => {
  it("each session id has its own document", async () => {
    const { session } = await loadSession();
    const id1 = await session.start({ user: "alice" });
    const id2 = await session.start({ user: "bob" });

    expect(await session.get(id1, "user")).toBe("alice");
    expect(await session.get(id2, "user")).toBe("bob");
    expect(id1).not.toBe(id2);
  });

  it("set on one id does not affect another", async () => {
    const { session } = await loadSession();
    const id1 = await session.start({});
    const id2 = await session.start({});

    await session.set(id1, "key", "value1");

    expect(await session.get(id1, "key")).toBe("value1");
    expect(await session.get(id2, "key")).toBeNull();
  });

  it("destroy removes only the target session", async () => {
    const { session } = await loadSession();
    const id1 = await session.start({ a: 1 });
    const id2 = await session.start({ b: 2 });

    await session.destroy(id1);

    expect(await session.all(id1)).toBeNull();
    expect(await session.all(id2)).toEqual({ b: 2 });
  });
});

describe("session store graceful degradation", () => {
  it("start returns empty string when Redis is down", async () => {
    state.redisReady = false;
    const { session } = await loadSession();
    expect(await session.start({})).toBe("");
  });

  it("all returns null when Redis is down", async () => {
    state.redisReady = false;
    const { session } = await loadSession();
    expect(await session.all("nonexistent")).toBeNull();
  });

  it("set returns false when Redis is down", async () => {
    state.redisReady = false;
    const { session } = await loadSession();
    expect(await session.set("id", "key", "val")).toBe(false);
  });

  it("refresh returns false when Redis is down", async () => {
    state.redisReady = false;
    const { session } = await loadSession();
    expect(await session.refresh("id")).toBe(false);
  });

  it("destroy returns false when Redis is down", async () => {
    state.redisReady = false;
    const { session } = await loadSession();
    expect(await session.destroy("id")).toBe(false);
  });
});
