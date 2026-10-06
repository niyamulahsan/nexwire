import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Resource lifecycle: does a restarted server leave anything behind?
 *
 * `socket.ts` holds two module-level singletons and a duplicated Redis
 * connection. `initRealtime` is called from the HTTP server boot;
 * `closeRealtime` from the shutdown hook. Nothing in a type signature ties
 * those two together, so the shape that leaks is easy to write and impossible
 * to see.
 *
 * The failure that matters: `attachRedisAdapter` calls `pubClient.duplicate()`
 * and connects it. `closeRealtime` is the only place that connection is
 * released. If a restart path returns early — because realtime is disabled, or
 * because construction failed before `io` was assigned — the duplicated
 * connection survives into the next boot. On a server under a supervisor that
 * restarts on every deploy, each cycle adds one connection until Redis's client
 * limit is hit, and the symptom is connection-refused on a service that was
 * healthy minutes earlier, with nothing pointing at a leaked socket.
 *
 * So these tests count connections rather than checking that functions were
 * called. That is the difference coverage cannot make.
 */

/** Records every server, connection and duplicated client the module makes. */
const state = vi.hoisted(() => ({
  instances: [] as Array<Record<string, unknown>>,
  duplicates: [] as Array<Record<string, unknown>>,
  // Read at call time: the module reads config per call, but is re-imported
  // per test so its module-scope singletons start clean.
  config: { realtimeEnabled: true, redisEnabled: false },
  auth: { isAuthenticated: false, userId: null as number | null, roles: [] as string[] },
  failQuit: false,
  failConnect: false,
  failServerConstruction: false,
  bun: false,
  logs: [] as string[]
}));

vi.mock("@/config/index.js", () => ({
  get appConfig() {
    return { url: "http://localhost:3000", frontendUrl: "http://localhost:5173" };
  },
  get realtimeConfig() {
    return { enabled: state.config.realtimeEnabled };
  },
  get redisConfig() {
    return { enabled: state.config.redisEnabled };
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

vi.mock("@/framework/runtime/runtime.js", () => ({
  isBun: () => state.bun
}));

/** The shared pub client, plus the `duplicate()` that is the leak we watch. */
vi.mock("@/framework/redis/client.js", () => ({
  redisClientIfReady: () => (state.config.redisEnabled ? (state.instances[0]?.shared ?? null) : null)
}));

vi.mock("@/framework/realtime/socket-cookie.js", () => ({
  authFromSocketHandshake: async () => ({ ...state.auth }),
  unauthenticatedRealtimeAuth: () => ({ isAuthenticated: false, userId: null, roles: [] })
}));

vi.mock("@socket.io/redis-adapter", () => ({
  createAdapter: (pub: unknown, sub: unknown) => ({ kind: "redis-adapter", pub, sub })
}));

/**
 * A Socket.IO double that records what it was asked to do. The real class binds
 * a listening socket and opens timers, neither of which belongs in a unit test.
 *
 * `setAdapter` is named apart from `adapter` because a class field called
 * `adapter` shadows the method of the same name, and the call site is
 * `io.adapter(...)`.
 */
vi.mock("socket.io", () => {
  class FakeServer {
    handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
    middlewares: Array<(socket: unknown, next: (error?: Error) => void) => void> = [];
    corsOptions: { origin?: string[]; credentials?: boolean } | undefined;
    appliedAdapter: unknown = null;
    closed = false;
    attachedTo: unknown;
    boundTo: unknown;

    constructor(attachedTo?: unknown, options?: unknown) {
      // Port already in use: the most common reason a deploy fails, and the one
      // most likely to leave a half-built singleton behind.
      if (state.failServerConstruction) throw new Error("EADDRINUSE: address already in use");
      this.attachedTo = attachedTo;
      this.corsOptions = (options as { cors?: { origin?: string[]; credentials?: boolean } })?.cors;
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      (this.handlers[event] ||= []).push(handler);
      return this;
    }

    use(middleware: (socket: unknown, next: (error?: Error) => void) => void) {
      this.middlewares.push(middleware);
      return this;
    }

    adapter(value: unknown) {
      this.appliedAdapter = value;
      return this;
    }

    bind(engine: unknown) {
      this.boundTo = engine;
      return this;
    }

    close(callback: () => void) {
      this.closed = true;
      callback();
    }

    /** Drives the connection handler the way a real client would. */
    async simulateConnection(socket: Record<string, unknown>) {
      for (const middleware of this.middlewares) {
        await new Promise<void>((resolve, reject) => {
          middleware(socket, (error) => (error ? reject(error) : resolve()));
        });
      }
      for (const handler of this.handlers.connection || []) handler(socket);
    }
  }

  return { Server: FakeServer };
});

type FakeServerHandle = {
  closed: boolean;
  corsOptions?: { origin?: string[]; credentials?: boolean };
  appliedAdapter: unknown;
  simulateConnection: (socket: Record<string, unknown>) => Promise<void>;
  boundTo: unknown;
};

/** Builds the shared client and puts it where the mock hands it out. */
function sharedClient() {
  const makeLeg = (kind: string): Record<string, unknown> => ({
    kind,
    connected: false,
    quitCalled: false,
    disconnected: false,
    async connect() {
      if (state.failConnect) throw new Error(`connect ECONNREFUSED 127.0.0.1:6379 (${kind})`);
      this.connected = true;
    },
    async quit() {
      this.quitCalled = true;
      if (state.failQuit) throw new Error("Connection is closed.");
    },
    disconnect() {
      this.disconnected = true;
    }
  });

  const client = makeLeg("shared");
  client.duplicate = () => {
    const copy = makeLeg("duplicate");
    state.duplicates.push(copy);
    return copy;
  };

  state.instances.push({ shared: client });
  return client;
}

/** A fresh module each time: the singletons live at module scope. */
async function loadSocket() {
  vi.resetModules();
  return import("@/framework/realtime/socket.js");
}

/** Duplicated connections still holding a socket after teardown. */
function leakedDuplicates() {
  return state.duplicates.filter((client) => !client.quitCalled && !client.disconnected);
}

async function boot(extra: Record<string, unknown> = {}) {
  const module_ = await loadSocket();
  const result = await module_.initRealtime({ httpServer: {}, ...extra });
  return { module_, server: result?.io as unknown as FakeServerHandle | undefined };
}

beforeEach(() => {
  state.instances.length = 0;
  state.duplicates.length = 0;
  state.logs.length = 0;
  state.config.realtimeEnabled = true;
  state.config.redisEnabled = false;
  state.auth = { isAuthenticated: false, userId: null, roles: [] };
  state.failQuit = false;
  state.failConnect = false;
  state.failServerConstruction = false;
  state.bun = false;
});

describe("initialising the realtime server", () => {
  it("does nothing at all when realtime is switched off", async () => {
    // Realtime-off is a supported configuration, and a developer who sets it
    // should not get a listening socket they did not ask for.
    state.config.realtimeEnabled = false;
    const { initRealtime } = await loadSocket();

    await expect(initRealtime({ httpServer: {} })).resolves.toBeNull();
    expect(state.instances).toHaveLength(0);
    expect(state.logs.some((line) => line.includes("disabled"))).toBe(true);
  });

  it("opens one server no matter how many times it is initialised", async () => {
    // The same leak shape as the Redis client, one layer up. Server bootstrap,
    // a health probe and a test harness can all call initRealtime, and only the
    // module-level `io` prevents a second bind to the same port.
    const module_ = await loadSocket();

    const first = await module_.initRealtime({ httpServer: {} });
    const second = await module_.initRealtime({ httpServer: {} });
    const third = await module_.initRealtime({ httpServer: {} });

    expect(first?.io).toBe(second?.io);
    expect(second?.io).toBe(third?.io);
  });

  it("gives the same instance back to broadcast helpers", async () => {
    const { initRealtime, socketServer, ioServer } = await loadSocket();

    expect(socketServer()).toBeNull();
    await initRealtime({ httpServer: {} });

    // Both names must be the same object, or a broadcast reaches one server
    // while a health check reports on another.
    expect(socketServer()).not.toBeNull();
    expect(ioServer()).toBe(socketServer());
  });

  it("allows only the configured origins", async () => {
    const { server } = await boot();

    // An open CORS origin on a websocket is the same hole as an open one on an
    // API: any site could then open an authenticated socket in a user's browser.
    expect(server?.corsOptions?.origin).toContain("http://localhost:3000");
    expect(server?.corsOptions?.origin).toContain("http://localhost:5173");
    expect(server?.corsOptions?.credentials).toBe(true);
  });

  it("never allows every origin, however it is configured", async () => {
    const { server } = await boot();
    const origins = server?.corsOptions?.origin ?? [];

    // The specific thing to forbid. A wildcard here would let any site open an
    // authenticated socket in a signed-in user's browser.
    expect(origins).not.toContain("*");
    // And each configured origin appears once, so a URL set in both APP_URL and
    // FRONTEND_URL does not produce a confusing duplicate.
    expect(new Set(origins).size).toBe(origins.length);
  });
});

describe("shutting the realtime server down", () => {
  it("closes the server and forgets it, so the next boot starts clean", async () => {
    const { module_, server } = await boot();

    await module_.closeRealtime();

    // A closed server that still looks live is how a restart ends up binding a
    // port that is already taken, or broadcasting into a dead emitter.
    expect(server?.closed).toBe(true);
    expect(module_.socketServer()).toBeNull();
  });

  it("gives back the duplicated Redis connection it opened", async () => {
    // The actual leak. `attachRedisAdapter` duplicates the shared client for
    // the subscription leg, and this is the only code that releases it.
    state.config.redisEnabled = true;
    sharedClient();
    const { module_ } = await boot();

    expect(state.duplicates).toHaveLength(1);

    await module_.closeRealtime();

    expect(state.duplicates[0].quitCalled).toBe(true);
    expect(leakedDuplicates()).toHaveLength(0);
  });

  it("attaches the redis adapter across processes", async () => {
    // Without the adapter, a broadcast from one instance never reaches a client
    // connected to another - the classic "it works on my machine" bug in
    // production, where there is more than one instance.
    state.config.redisEnabled = true;
    sharedClient();
    const { server } = await boot();

    expect((server?.appliedAdapter as { kind?: string })?.kind).toBe("redis-adapter");
  });

  it("falls back to a hard disconnect when quit fails", async () => {
    // quit() is the polite path and it fails exactly when the socket is already
    // half-dead, which is the state you are usually shutting down from. Without
    // the fallback the handle stays open.
    state.config.redisEnabled = true;
    sharedClient();
    state.failQuit = true;
    const { module_ } = await boot();

    await module_.closeRealtime();

    expect(state.duplicates[0].disconnected).toBe(true);
    expect(leakedDuplicates()).toHaveLength(0);
  });

  it("leaks nothing across a restart", async () => {
    // What a supervisor does on every deploy: boot, serve, shut down, boot.
    // Ten cycles must leave behind exactly as much as one.
    state.config.redisEnabled = true;
    sharedClient();
    const module_ = await loadSocket();

    for (let cycle = 0; cycle < 10; cycle++) {
      await module_.initRealtime({ httpServer: {} });
      await module_.closeRealtime();
    }

    expect(leakedDuplicates()).toHaveLength(0);
    // One duplicate per boot is correct: each boot gets its own subscription leg
    // and gives it back.
    expect(state.duplicates).toHaveLength(10);
    expect(state.duplicates.filter((client) => client.quitCalled)).toHaveLength(10);
  });

  it("is safe to call twice, and safe with no server at all", async () => {
    // Two shutdown paths touching the same singleton must not throw at each
    // other, and a server that never started has nothing to release.
    const { module_ } = await boot();

    await module_.closeRealtime();
    await expect(module_.closeRealtime()).resolves.toBeUndefined();

    const never = await loadSocket();
    await expect(never.closeRealtime()).resolves.toBeUndefined();
  });

  it("can boot again after a shutdown, and binds a fresh server", async () => {
    const module_ = await loadSocket();
    const first = await module_.initRealtime({ httpServer: {} });
    await module_.closeRealtime();
    const second = await module_.initRealtime({ httpServer: {} });

    // A fresh instance, not the closed one handed back out of the `io` cache.
    expect(second?.io).not.toBe(first?.io);
    expect(second?.io).not.toBeNull();
  });
});

describe("connection auth", () => {
  it("joins an authenticated socket to its user and role rooms", async () => {
    state.auth = { isAuthenticated: true, userId: 42, roles: ["admin", "editor"] };
    const { server } = await boot();

    const joined: string[] = [];
    await server?.simulateConnection({
      id: "s1",
      data: {} as Record<string, unknown>,
      join: (room: string) => joined.push(room),
      on: () => undefined
    });

    // These room names are the contract with the broadcast helpers. If auth
    // stops joining them, `notifyUser(42)` silently reaches nobody.
    expect(joined).toContain("auth");
    expect(joined).toContain("user:42");
    expect(joined).toContain("role:admin");
    expect(joined).toContain("role:editor");
    expect(joined).not.toContain("guest");
  });

  it("puts an unauthenticated socket in the guest room only", async () => {
    const { server } = await boot();

    const joined: string[] = [];
    await server?.simulateConnection({
      id: "s2",
      data: {} as Record<string, unknown>,
      join: (room: string) => joined.push(room),
      on: () => undefined
    });

    expect(joined).toEqual(["guest"]);
    // The failure to prevent: a guest socket joining "auth" and receiving
    // broadcasts meant for signed-in users.
    expect(joined).not.toContain("auth");
  });

  it("refuses to build a server it cannot bind, without caching the failure", async () => {
    // The port is in use - the single most common reason a deploy fails. If the
    // failed construction still assigned the singleton, every later attempt
    // would hand back a dead server instead of retrying.
    state.failServerConstruction = true;
    const { initRealtime, socketServer } = await loadSocket();

    await expect(initRealtime({ httpServer: {} })).rejects.toThrow("EADDRINUSE");

    // Nothing cached, so a retry after freeing the port can succeed.
    expect(socketServer()).toBeNull();

    state.failServerConstruction = false;
    await expect(initRealtime({ httpServer: {} })).resolves.not.toBeNull();
  });

  it("joins no role room for a user with no roles", async () => {
    state.auth = { isAuthenticated: true, userId: 7, roles: [] };
    const { server } = await boot();

    const joined: string[] = [];
    await server?.simulateConnection({
      id: "s3",
      data: {} as Record<string, unknown>,
      join: (room: string) => joined.push(room),
      on: () => undefined
    });

    expect(joined).toEqual(["auth", "user:7"]);
  });
});