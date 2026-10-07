import { describe, expect, it } from "vitest";
import { createRouter, group } from "@/framework/http/router.js";

/**
 * Tier 1: group() middleware scoping.
 *
 * The failure class: `group(mw)` used to call `this.use("*", mw)`, which
 * registers a *route entry* on the Hono instance. A route entry survives
 * mounting — `app.route("/mod", child)` copies it verbatim, and "*" rewrites
 * to "/mod/*". So a limiter declared for the public routes of one sub-router
 * also ran for the private routes of a sibling sub-router, and for every route
 * added to the parent after the mount. The more times a router was mounted,
 * the more copies of the same middleware existed.
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
  return async (c: any, next: any) => {
    calls.push({ mw: name, path: c.req.path });
    await next();
  };
}

const get = (path: string) => ({ path, method: "get" as const });

function fresh() {
  return { calls: [] as Call[] };
}

describe("group() middleware scoping", () => {
  it("runs for the routes registered after it on the same router", async () => {
    const { calls } = fresh();
    const routes = createRouter()
      .group(recorder(calls, "limiter"))
      .api(get("/public"), (c: any) => c.json({ ok: "public" }));

    const app = createRouter().route("/", routes);
    const res = await app.request("/public");

    expect(res.status).toBe(200);
    expect(calls).toEqual([{ mw: "limiter", path: "/public" }]);
  });

  it("does not leak across sibling sub-routers mounted at the same prefix", async () => {
    const { calls } = fresh();

    const publicRoutes = createRouter()
      .group(recorder(calls, "limiter"))
      .api(get("/public"), (c: any) => c.json({ ok: "public" }));

    const protectedRoutes = createRouter()
      .group(recorder(calls, "auth"))
      .api(get("/private"), (c: any) => c.json({ ok: "private" }));

    const module = createRouter().route("/", publicRoutes).route("/", protectedRoutes);
    const app = createRouter().route("/mod", module);

    const publicRes = await app.request("/mod/public");
    const privateRes = await app.request("/mod/private");

    expect(publicRes.status).toBe(200);
    expect(privateRes.status).toBe(200);

    // Each route sees exactly its own group middleware, once.
    // c.req.path is the full request path, so it carries the mount prefix.
    const on = (suffix: string) => calls.filter((c) => c.path.endsWith(suffix));
    expect(on("/public")).toHaveLength(1);
    expect(on("/public")[0].mw).toBe("limiter");
    expect(on("/private")).toHaveLength(1);
    expect(on("/private")[0].mw).toBe("auth");
  });

  it("does not reach routes added to the parent after the mount", async () => {
    const { calls } = fresh();

    const scoped = createRouter()
      .group(recorder(calls, "limiter"))
      .api(get("/scoped"), (c: any) => c.json({ ok: "scoped" }));

    const app = createRouter().route("/", scoped);
    app.get("/unrelated", (c: any) => c.json({ ok: "unrelated" }));

    const res = await app.request("/unrelated");

    expect(res.status).toBe(200);
    expect(calls).toEqual([]);
  });

  it("cannot let a sibling group's rejecting middleware block another group", async () => {
    const { calls } = fresh();
    const deny = async (c: any) => c.json({ message: "Unauthorized" }, 401);

    const adminRoutes = createRouter()
      .group(deny)
      .api(get("/games"), (c: any) => c.json({ ok: "games" }));

    const runtimeRoutes = createRouter()
      .group(recorder(calls, "hmac"))
      .api(get("/spin"), (c: any) => c.json({ ok: "spin" }));

    const module = createRouter().route("/", adminRoutes).route("/", runtimeRoutes);
    const app = createRouter().route("/api/mod", module);

    const spinRes = await app.request("/api/mod/spin");
    expect(spinRes.status).toBe(200);
    expect(calls.map((c) => c.mw)).toEqual(["hmac"]);

    // The admin route keeps its own protection.
    const gamesRes = await app.request("/api/mod/games");
    expect(gamesRes.status).toBe(401);
  });

  it("keeps one copy of the middleware however many times the router is mounted", async () => {
    const { calls } = fresh();

    const scoped = createRouter()
      .group(recorder(calls, "limiter"))
      .api(get("/x"), (c: any) => c.json({ ok: "x" }));

    const app = createRouter().route("/a", scoped).route("/b", scoped);

    await app.request("/a/x");
    expect(calls).toHaveLength(1);

    calls.length = 0;
    await app.request("/b/x");
    expect(calls).toHaveLength(1);
  });
});

describe("group() middleware ordering", () => {
  it("runs group middleware before the middleware passed to .api()", async () => {
    const { calls } = fresh();

    const routes = createRouter()
      .group(recorder(calls, "group"))
      .api(
        get("/ordered"),
        [recorder(calls, "route")],
        (c: any) => c.json({ ok: "ordered" })
      );

    const res = await createRouter().route("/", routes).request("/ordered");

    expect(res.status).toBe(200);
    expect(calls.map((c) => c.mw)).toEqual(["group", "route"]);
  });

  it("accumulates across repeated .group() calls", async () => {
    const { calls } = fresh();

    const routes = createRouter()
      .group(recorder(calls, "first"))
      .group(recorder(calls, "second"))
      .api(get("/stacked"), (c: any) => c.json({ ok: "stacked" }));

    const res = await createRouter().route("/", routes).request("/stacked");

    expect(res.status).toBe(200);
    expect(calls.map((c) => c.mw)).toEqual(["first", "second"]);
  });

  it("short-circuits when a group middleware does not call next()", async () => {
    const { calls } = fresh();
    const deny = async (c: any) => c.json({ ok: false, denied: true }, 403);

    const routes = createRouter()
      .group(deny)
      .api(get("/denied"), (c: any) => {
        calls.push({ mw: "handler", path: c.req.path });
        return c.json({ ok: true });
      });

    const res = await createRouter().route("/", routes).request("/denied");

    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });
});

describe("group() helper", () => {
  it("produces a router whose middleware applies to every .api() route", async () => {
    const { calls } = fresh();

    const routes = group(recorder(calls, "helper"))
      .api(get("/one"), (c: any) => c.json({ n: 1 }))
      .api(get("/two"), (c: any) => c.json({ n: 2 }));

    const app = createRouter().route("/", routes);

    await app.request("/one");
    await app.request("/two");

    expect(calls.map((c) => c.path)).toEqual(["/one", "/two"]);
  });

  it("still throws when .api() is given no handler", () => {
    expect(() => createRouter().api(get("/bad"), undefined as any)).toThrow(/handler function/);
  });
});
