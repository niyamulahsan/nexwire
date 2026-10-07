import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { describe, expect, it } from "vitest";
import { createRouter, group } from "@/framework/http/router.js";

/**
 * Tier 1: group() middleware scoping.
 *
 * The failure class: `group(mw)` calls `router.use(mw)` with no path, which
 * registers a catch-all in that router's own stack. When the router is mounted
 * at "/" the catch-all matches every request that enters it — including ones
 * whose route lives in a sibling router mounted at the same prefix. A limiter
 * declared for the public routes therefore also ran for the private routes,
 * and for every route added to the parent after the mount.
 *
 * That leak is not only about seeing extra middleware: a sibling group that
 * *rejects* stops the request outright. A module whose admin routes declare
 * `group(authMiddleware)` and whose runtime routes declare `group(hmacAuth)`,
 * both mounted at `/api/<module>`, had every runtime request answered with
 * `{"message":"Unauthorized"}` by a middleware it was never declared on.
 *
 * The contract: group middleware belongs to the routes registered with `.api()`
 * on that same router, travels with them wherever they are mounted, and never
 * reaches a route it was not declared on.
 */

type Call = { mw: string; path: string };

function recorder(calls: Call[], name: string) {
  return async (_req: any, res: any, next: any) => {
    calls.push({ mw: name, path: _req.path ?? _req.url });
    next();
  };
}

const get = (path: string) => ({ path, method: "get" as const, responses: {} });

async function serve(app: express.Express, run: (base: string) => Promise<void>) {
  const server: Server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("group() middleware scoping", () => {
  it("runs for the routes registered after it on the same router", async () => {
    const calls: Call[] = [];
    const routes = createRouter()
      .group(recorder(calls, "limiter"))
      .api(get("/public"), (_req, res) => res.json({ ok: "public" }));

    const app = express();
    app.use("/", routes as any);

    await serve(app, async (base) => {
      const res = await fetch(`${base}/public`);
      expect(res.status).toBe(200);
    });

    expect(calls).toEqual([{ mw: "limiter", path: "/public" }]);
  });

  it("does not leak across sibling sub-routers mounted at the same prefix", async () => {
    const calls: Call[] = [];

    const publicRoutes = createRouter()
      .group(recorder(calls, "limiter"))
      .api(get("/public"), (_req, res) => res.json({ ok: "public" }));

    const protectedRoutes = createRouter()
      .group(recorder(calls, "auth"))
      .api(get("/private"), (_req, res) => res.json({ ok: "private" }));

    const module = createRouter().route("/", publicRoutes).route("/", protectedRoutes);

    const app = express();
    app.use("/mod", module as any);

    await serve(app, async (base) => {
      const publicRes = await fetch(`${base}/mod/public`);
      const privateRes = await fetch(`${base}/mod/private`);

      expect(publicRes.status).toBe(200);
      expect(privateRes.status).toBe(200);
    });

    const on = (suffix: string) => calls.filter((c) => c.path.endsWith(suffix));
    expect(on("/public")).toHaveLength(1);
    expect(on("/public")[0].mw).toBe("limiter");
    expect(on("/private")).toHaveLength(1);
    expect(on("/private")[0].mw).toBe("auth");
  });

  it("does not reach routes added to the parent after the mount", async () => {
    const calls: Call[] = [];

    const scoped = createRouter()
      .group(recorder(calls, "limiter"))
      .api(get("/scoped"), (_req, res) => res.json({ ok: "scoped" }));

    const app = express();
    app.use("/", scoped as any);
    app.get("/unrelated", (_req, res) => res.json({ ok: "unrelated" }));

    await serve(app, async (base) => {
      const res = await fetch(`${base}/unrelated`);
      expect(res.status).toBe(200);
    });

    expect(calls).toEqual([]);
  });

  it("cannot let a sibling group's rejecting middleware block another group", async () => {
    const calls: Call[] = [];
    const deny = (_req: any, res: any) => res.status(401).json({ message: "Unauthorized" });

    const adminRoutes = createRouter()
      .group(deny)
      .api(get("/games"), (_req, res) => res.json({ ok: "games" }));

    const runtimeRoutes = createRouter()
      .group(recorder(calls, "hmac"))
      .api(get("/spin"), (_req, res) => res.json({ ok: "spin" }));

    const module = createRouter().route("/", adminRoutes).route("/", runtimeRoutes);

    const app = express();
    app.use("/api/mod", module as any);

    await serve(app, async (base) => {
      const spinRes = await fetch(`${base}/api/mod/spin`);
      expect(spinRes.status).toBe(200);

      // The admin route keeps its own protection.
      const gamesRes = await fetch(`${base}/api/mod/games`);
      expect(gamesRes.status).toBe(401);
    });

    expect(calls.map((c) => c.mw)).toEqual(["hmac"]);
  });
});

describe("group() middleware ordering", () => {
  it("runs group middleware before the middleware passed to .api()", async () => {
    const calls: Call[] = [];

    const routes = createRouter()
      .group(recorder(calls, "group"))
      .api(get("/ordered"), [recorder(calls, "route")], (_req, res) =>
        res.json({ ok: "ordered" })
      );

    const app = express();
    app.use("/", routes as any);

    await serve(app, async (base) => {
      const res = await fetch(`${base}/ordered`);
      expect(res.status).toBe(200);
    });

    expect(calls.map((c) => c.mw)).toEqual(["group", "route"]);
  });

  it("accumulates across repeated .group() calls", async () => {
    const calls: Call[] = [];

    const routes = createRouter()
      .group(recorder(calls, "first"))
      .group(recorder(calls, "second"))
      .api(get("/stacked"), (_req, res) => res.json({ ok: "stacked" }));

    const app = express();
    app.use("/", routes as any);

    await serve(app, async (base) => {
      const res = await fetch(`${base}/stacked`);
      expect(res.status).toBe(200);
    });

    expect(calls.map((c) => c.mw)).toEqual(["first", "second"]);
  });

  it("short-circuits when a group middleware does not call next()", async () => {
    const calls: Call[] = [];
    const deny = (_req: any, res: any) => res.status(403).json({ denied: true });

    const routes = createRouter()
      .group(deny)
      .api(get("/denied"), (req: any, res: any) => {
        calls.push({ mw: "handler", path: req.path });
        res.json({ ok: true });
      });

    const app = express();
    app.use("/", routes as any);

    await serve(app, async (base) => {
      const res = await fetch(`${base}/denied`);
      expect(res.status).toBe(403);
    });

    expect(calls).toEqual([]);
  });
});

describe("group() helper", () => {
  it("produces a router whose middleware applies to every .api() route", async () => {
    const calls: Call[] = [];

    const routes = group(recorder(calls, "helper"))
      .api(get("/one"), (_req, res) => res.json({ n: 1 }))
      .api(get("/two"), (_req, res) => res.json({ n: 2 }));

    const app = express();
    app.use("/", routes as any);

    await serve(app, async (base) => {
      await fetch(`${base}/one`);
      await fetch(`${base}/two`);
    });

    expect(calls.map((c) => c.path)).toEqual(["/one", "/two"]);
  });

  it("still throws when .api() is given no handler", () => {
    expect(() => createRouter().api(get("/bad"), undefined as any)).toThrow(/handler function/);
  });
});
