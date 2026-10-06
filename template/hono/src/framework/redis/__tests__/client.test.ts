import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Resource lifecycle: does this module hand out one connection, and give it back?
 *
 * `client.ts` is a module-level singleton, which is exactly the shape that leaks.
 * Nothing in the codebase is watching connection counts, so a single missing
 * `closeRedis()` on one shutdown path means every worker that ever starts opens a
 * socket it never closes. On a machine running a queue worker that is restarted by
 * a supervisor, that is a slow exhaustion that only shows up in production, days
 * later, as connection-refused errors that look like a Redis problem.
 *
 * None of that is visible from a coverage number. These tests count the things
 * coverage cannot: how many connections were opened, how many listeners each one
 * carries, and whether closing actually released anything.
 */

/** Shared across the mocked ioredis and the mocked config, via vi.hoisted. */
const state = vi.hoisted(() => ({
  created: [] as Array<Record<string, unknown>>,
  config: { enabled: false, url: "redis://127.0.0.1:6379", prefix: "nexwire" },
  logs: [] as string[],
  // Driven from the test rather than set on an instance afterwards, because
  // `new Redis(...)` and the first await both happen inside one call we do not
  // get to step into.
  fail: { connect: false, ping: false, quit: false }
}));

vi.mock("@/config/index.js", () => ({
  get redisConfig() {
    return state.config;
  }
}));

vi.mock("@/framework/support/logger.js", () => ({
  logger: {
    info: (message: string) => state.logs.push(`info: ${message}`),
    warn: (message: string) => state.logs.push(`warn: ${message}`),
    error: (message: string) => state.logs.push(`error: ${message}`),
    debug: () => {}
  }
}));

/** A stand-in that records what a real ioredis connection would cost us. */
vi.mock("ioredis", () => {
  class FakeRedis {
    listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
    status = "wait";
    disconnected = false;
    quitCalled = false;

    constructor(
      public url: string,
      public options: Record<string, unknown>
    ) {
      state.created.push(this as unknown as Record<string, unknown>);
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      (this.listeners[event] ||= []).push(handler);
      return this;
    }

    listenerCount(event: string) {
      return (this.listeners[event] || []).length;
    }

    async connect() {
      if (state.fail.connect) throw new Error("connect ECONNREFUSED 127.0.0.1:6379");
      this.status = "ready";
    }

    async ping() {
      if (state.fail.ping) throw new Error("NOAUTH Authentication required");
      return "PONG";
    }

    async quit() {
      this.quitCalled = true;
      if (state.fail.quit) throw new Error("Connection is closed.");
      this.status = "end";
    }

    disconnect() {
      this.disconnected = true;
      this.status = "end";
    }
  }

  return { Redis: FakeRedis };
});

type FakeRedisHandle = {
  listenerCount: (event: string) => number;
  disconnected: boolean;
  quitCalled: boolean;
  status: string;
};

/** A fresh module each time, because the singleton lives at module scope. */
async function loadClient() {
  vi.resetModules();
  return import("@/framework/redis/client.js");
}

beforeEach(() => {
  state.created.length = 0;
  state.logs.length = 0;
  state.config.enabled = false;
  state.config.url = "redis://127.0.0.1:6379";
  state.config.prefix = "nexwire";
  state.fail.connect = false;
  state.fail.ping = false;
  state.fail.quit = false;
});

describe("Redis connection lifecycle", () => {
  it("opens exactly one connection no matter how many times it is initialised", async () => {
    // The real leak shape. Server bootstrap, worker bootstrap and scheduler
    // bootstrap can all call initRedis(); a module-level singleton is the only
    // thing stopping three sockets, and nothing in a type signature enforces it.
    state.config.enabled = true;
    const { initRedis } = await loadClient();

    const clients = [];
    for (let i = 0; i < 10; i++) {
      clients.push(await initRedis());
    }

    expect(state.created).toHaveLength(1);
    const [first] = clients;
    for (const client of clients) {
      expect(client).toBe(first);
    }
  });

  it("attaches one error listener per connection, not one per initialisation", async () => {
    // The same leak one level down. Each retry after a failed connect builds a new
    // Redis instance and subscribes it, so an unclosed instance keeps its error
    // handler alive and keeps logging to a logger nobody reads.
    state.config.enabled = true;
    const { initRedis } = await loadClient();

    await initRedis();
    await initRedis();
    await initRedis();

    const only = state.created[0] as unknown as FakeRedisHandle;
    expect(state.created).toHaveLength(1);
    expect(only.listenerCount("error")).toBe(1);
  });

  it("reports ready only once the connection is actually usable", async () => {
    state.config.enabled = true;
    const { initRedis, redis, redisReady } = await loadClient();

    expect(redisReady()).toBe(false);
    expect(redis()).toBeNull();

    await initRedis();

    expect(redisReady()).toBe(true);
    expect(redis()).not.toBeNull();
  });
});

describe("closing the Redis connection", () => {
  it("gives the connection back and stops reporting ready", async () => {
    state.config.enabled = true;
    const { initRedis, closeRedis, redis, redisReady } = await loadClient();
    await initRedis();

    await closeRedis();

    // Not null-and-still-considered-usable. A closed client that still passes the
    // readiness check is how a worker ends up queueing jobs into the void.
    expect(redis()).toBeNull();
    expect(redisReady()).toBe(false);
  });

  it("asks the connection to quit rather than yanking it", async () => {
    state.config.enabled = true;
    const { initRedis, closeRedis } = await loadClient();
    await initRedis();

    await closeRedis();

    const only = state.created[0] as unknown as FakeRedisHandle;
    expect(only.quitCalled).toBe(true);
  });

  it("falls back to a hard disconnect when quit fails", async () => {
    // quit() is the polite path and it fails exactly when the socket is already
    // half-dead - which is the situation you are usually closing during. If the
    // fallback were missing, shutdown would leave the handle open.
    state.config.enabled = true;
    state.fail.quit = true;
    const { initRedis, closeRedis, redis } = await loadClient();
    await initRedis();

    await closeRedis();

    const only = state.created[0] as unknown as FakeRedisHandle;
    expect(only.disconnected).toBe(true);
    expect(redis()).toBeNull();
  });

  it("is safe to call twice, and safe with no connection at all", async () => {
    // Two shutdown paths touching the same singleton must not throw at each other.
    state.config.enabled = true;
    const { initRedis, closeRedis } = await loadClient();
    await initRedis();

    await closeRedis();
    await expect(closeRedis()).resolves.toBeUndefined();

    const never = await loadClient();
    await expect(never.closeRedis()).resolves.toBeUndefined();
    expect(state.created).toHaveLength(1);
  });

  it("can reconnect after a close, without stacking connections", async () => {
    // A supervisor restarts a worker in-process more often than anyone expects.
    state.config.enabled = true;
    const { initRedis, closeRedis, redisReady } = await loadClient();

    await initRedis();
    await closeRedis();
    await initRedis();

    expect(redisReady()).toBe(true);
    expect(state.created).toHaveLength(2);
  });

  it("closes the half-open connection when the handshake fails", async () => {
    // The dangerous case. `new Redis(...)` has already opened a socket by the time
    // ping() throws, so the instance exists and holds a handle. If the failure
    // path only nulled the reference, that handle would be unreachable and never
    // closed - and it would happen again on every retry.
    state.config.enabled = true;
    state.fail.ping = true;
    const { initRedis, redis, redisReady, redisError } = await loadClient();

    await expect(initRedis()).resolves.toBeNull();

    const opened = state.created[0] as unknown as FakeRedisHandle;
    expect(opened.disconnected).toBe(true);
    // And nothing is left pointing at it.
    expect(redis()).toBeNull();
    expect(redisReady()).toBe(false);
    expect(redisError()).toBeTruthy();
  });

  it("does not leave a dead client behind when connect itself fails", async () => {
    state.config.enabled = true;
    state.fail.connect = true;
    const { initRedis, redis, redisReady } = await loadClient();

    await expect(initRedis()).resolves.toBeNull();

    expect((state.created[0] as unknown as FakeRedisHandle).disconnected).toBe(true);
    expect(redis()).toBeNull();
    expect(redisReady()).toBe(false);
  });

  it("recovers once Redis comes back, rather than staying poisoned", async () => {
    // A worker that started before Redis was ready must not be stuck forever: the
    // alternative is a process that logs "Redis unavailable" on every boot until
    // someone restarts it by hand.
    state.config.enabled = true;
    state.fail.connect = true;
    const first = await loadClient();
    await expect(first.initRedis()).resolves.toBeNull();

    state.fail.connect = false;
    const second = await loadClient();

    await expect(second.initRedis()).resolves.not.toBeNull();
    expect(second.redisReady()).toBe(true);
    expect(state.created).toHaveLength(2);
  });

  it("logs the failure with the password redacted", async () => {
    // These lines go to a log file that gets pasted into an issue. A Redis URL
    // routinely carries a password, so an unredacted line is a credential leak.
    state.config.enabled = true;
    state.config.url = "redis://user:sup3rsecret@127.0.0.1:6379";
    state.fail.ping = true;
    const { initRedis } = await loadClient();

    await initRedis();

    const logged = state.logs.join("\n");
    expect(logged).not.toContain("sup3rsecret");
  });
});

describe("when Redis is switched off", () => {
  it("opens no connection at all", async () => {
    // REDIS=false is the shipped default, so this is the path almost every new
    // project takes. It must not touch the network.
    const { initRedis, redis } = await loadClient();

    await expect(initRedis()).resolves.toBeNull();
    expect(state.created).toHaveLength(0);
    expect(redis()).toBeNull();
  });

  it("says why, instead of leaving a blank readiness flag", async () => {
    const { initRedis, redisError } = await loadClient();

    await initRedis();

    // A health endpoint or a support question needs this string.
    expect(redisError()).toContain("disabled");
  });

  it("refuses work rather than handing out an unusable client", async () => {
    const { redisClientIfReady } = await loadClient();

    expect(redisClientIfReady()).toBeNull();
  });
});
