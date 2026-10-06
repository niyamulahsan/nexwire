import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Resource lifecycle: a distributed lock is a resource, and it leaks in a way
 * that never announces itself.
 *
 * `runWithLock` guards scheduled jobs so two instances of a server do not run the
 * same cron job twice. The lock is taken, the handler runs, and the lock is
 * released. The release sits in a `finally`, which is the whole safety story.
 *
 * The failure that matters is the handler throwing - a database timeout, a bad
 * response from a third-party API, anything at all. If the release were not in a
 * `finally`, the lock would stay held until its TTL expired, and every scheduled
 * job in the app would quietly stop running. Nothing logs an error. The cron
 * entry still fires on time, still reports success, and does nothing. That is a
 * bug you find weeks later, from a report that "the nightly report stopped
 * arriving", with nothing in the logs pointing here.
 *
 * So these tests care about one thing above all: after the handler has run,
 * however it ran, is the lock gone?
 */

/** Records every command so a test can assert the lock was actually released. */
const state = vi.hoisted(() => ({
  sql: [] as string[],
  // The owner the code under test inserted, echoed back by the SELECT that
  // decides whether the lock was won. Mirrors a real unique constraint.
  insertedOwner: "" as string,
  forceOtherOwner: false,
  redisDeletes: [] as string[],
  // Two different failures that must not be confused: Redis is switched off
  // entirely (routes to the DB backend), or Redis is up but somebody else holds
  // the key (SET NX returns null, handler must not run).
  redisDisabled: false,
  redisLockUnavailable: false,
  prefix: "nexwire",
  dialect: "sqlite"
}));

vi.mock("@/config/index.js", () => ({
  get redisConfig() {
    return { prefix: state.prefix };
  }
}));

vi.mock("@/framework/redis/client.js", () => ({
  redis: () => ({
    set: async (key: string, _owner: string, mode: string, ttl: number, flag: string) => {
      state.sql.push(`SET ${key} ${mode} ${ttl} ${flag}`);
      return state.redisLockUnavailable ? null : "OK";
    },
    del: async (key: string) => {
      state.redisDeletes.push(key);
      return 1;
    }
  }),
  redisReady: () => !state.redisDisabled
}));

/**
 * A pool fake shared by all three dialects. `execute`, `query` and `unsafe` all
 * reach the same two decisions - capture the owner on INSERT, report it back on
 * SELECT - because that is the whole protocol the lock depends on.
 */
vi.mock("@/framework/database/connection.js", () => ({
  databaseDialect: () => state.dialect,
  databasePool: () => {
    const record = (sql: string, args: unknown[] = []) => {
      const flat = sql.replace(/\s+/g, " ").trim();
      state.sql.push(flat);
      if (flat.startsWith("INSERT")) state.insertedOwner = String(args[1] ?? "");
      // SQLite and MySQL ask with a follow-up SELECT; Postgres asks the INSERT
      // itself with RETURNING. Both answer the same question.
      return flat.includes("SELECT owner") || flat.includes("RETURNING owner");
    };
    const ownerRow = () => ({
      owner: state.forceOtherOwner ? "another-instance" : state.insertedOwner
    });

    return {
      // sqlite
      execute: async (statement: { sql: string; args?: unknown[] } | string) => {
        const sql = typeof statement === "string" ? statement : statement.sql;
        const args = typeof statement === "string" ? [] : (statement.args ?? []);
        return { rows: record(sql, args) ? [ownerRow()] : [] };
      },
      // mysql
      query: async (sql: string, args: unknown[] = []) => {
        const wantsOwner = record(sql, args);
        return wantsOwner ? [[ownerRow()]] : [[]];
      },
      // postgres
      unsafe: async (sql: string, args: unknown[] = []) => {
        return record(sql, args) ? [ownerRow()] : [];
      }
    };
  }
}));

async function loadLock() {
  vi.resetModules();
  return import("@/framework/scheduler/lock.js");
}

beforeEach(() => {
  state.sql.length = 0;
  state.redisDeletes.length = 0;
  state.insertedOwner = "";
  state.forceOtherOwner = false;
  state.redisDisabled = false;
  state.redisLockUnavailable = false;
  state.prefix = "nexwire";
  state.dialect = "sqlite";
});

/** Locks held at the end of a test, which is always zero in a healthy run. */
function releaseStatements() {
  return state.sql.filter((sql) => sql.startsWith("DELETE FROM"));
}

describe("runWithLock on the Redis backend", () => {
  it("takes the lock, runs the handler, and gives the lock back", async () => {
    const { runWithLock } = await loadLock();

    const outcome = await runWithLock("nightly.invoice-rollup", async () => "done");

    expect(outcome).toEqual({ ran: true, backend: "redis", result: "done" });
    expect(state.redisDeletes).toHaveLength(1);
  });

  it("releases the lock even when the handler throws", async () => {
    // The one that matters. A lock held until TTL means this job silently stops
    // running, with no error anywhere.
    const { runWithLock } = await loadLock();

    await expect(
      runWithLock("nightly.invoice-rollup", async () => {
        throw new Error("upstream API timed out");
      })
    ).rejects.toThrow("upstream API timed out");

    expect(state.redisDeletes).toHaveLength(1);
  });

  it("runs the handler exactly once per call", async () => {
    const { runWithLock } = await loadLock();
    let runs = 0;

    for (let i = 0; i < 5; i++) {
      await runWithLock("job", async () => {
        runs += 1;
      });
    }

    expect(runs).toBe(5);
    expect(state.redisDeletes).toHaveLength(5);
  });

  it("does not run the handler, and does not touch the lock, when it is already held", async () => {
    // Another instance holds it. Releasing a lock we do not own would free the
    // other instance's lock and let the job run twice - the exact thing the lock
    // exists to prevent.
    state.redisLockUnavailable = true;
    const { runWithLock } = await loadLock();
    let ran = false;

    const outcome = await runWithLock("job", async () => {
      ran = true;
    });

    expect(outcome).toEqual({ ran: false, backend: "redis" });
    expect(ran).toBe(false);
    expect(state.redisDeletes).toHaveLength(0);
  });

  it("namespaces the key by the configured Redis prefix", async () => {
    // Two applications sharing one Redis instance must not share lock keys, or
    // one app's job silently suppresses the other's.
    state.prefix = "acme-billing";
    const { runWithLock } = await loadLock();

    await runWithLock("nightly.rollup", async () => null);

    expect(state.sql[0]).toContain("acme-billing:lock:nightly.rollup");
  });

  it("asks Redis for a non-blocking take with a TTL, so a dead holder cannot wedge the job forever", async () => {
    const { runWithLock } = await loadLock();

    await runWithLock("job", async () => null, { ttlMs: 5000 });

    // NX = only set if absent. Without it every instance would "acquire" the same
    // key and all of them would run the job.
    expect(state.sql[0]).toContain("PX 5000 NX");
  });
});

describe("runWithLock on the database backend", () => {
  /** Force the DB path, which is what runs when Redis is switched off. */
  beforeEach(() => {
    state.redisDisabled = true;
  });

  it("runs the handler once it wins the lock, then releases it", async () => {
    const { runWithLock } = await loadLock();
    let ran = false;

    const outcome = await runWithLock("job", async () => {
      ran = true;
      return "done";
    });

    expect(outcome).toEqual({ ran: true, backend: "db", result: "done" });
    expect(ran).toBe(true);
    expect(releaseStatements()).toHaveLength(1);
  });

  it("releases the lock even when the handler throws", async () => {
    // The same leak as the Redis path, on the path almost every project actually
    // uses, because REDIS=false is the shipped default. A lock left behind here
    // blocks the job on every run until the TTL lapses.
    const { runWithLock } = await loadLock();

    await expect(
      runWithLock("nightly.rollup", async () => {
        throw new Error("database timeout");
      })
    ).rejects.toThrow("database timeout");

    expect(releaseStatements()).toHaveLength(1);
  });

  it("releases only its own lock, matched on owner as well as name", async () => {
    // A DELETE that matched on name alone would free a lock a different instance
    // had since taken, letting the same job run concurrently after all.
    const { runWithLock } = await loadLock();

    await runWithLock("job", async () => null);

    const release = releaseStatements()[0] ?? "";
    expect(release).toContain("owner");
  });

  it("creates its lock table before first use, so a fresh install works", async () => {
    const { runWithLock } = await loadLock();

    await runWithLock("job", async () => null);

    expect(state.sql[0]).toContain("CREATE TABLE IF NOT EXISTS");
    expect(state.sql[0]).toContain("scheduler_locks");
  });

  it("honours a custom lock table, so two schedules do not collide", async () => {
    const { runWithLock } = await loadLock();

    await runWithLock("job", async () => null, { tableName: "billing_locks" });

    expect(state.sql[0]).toContain("billing_locks");
  });

  it("never runs the handler when another owner holds the lock", async () => {
    state.forceOtherOwner = true;
    const { runWithLock } = await loadLock();
    let ran = false;

    const outcome = await runWithLock("job", async () => {
      ran = true;
    });

    expect(outcome).toEqual({ ran: false, backend: "db" });
    expect(ran).toBe(false);
    expect(releaseStatements()).toHaveLength(0);
  });

  it("uses a distinct owner per call, so two runs cannot release each other", async () => {
    const { runWithLock } = await loadLock();

    await runWithLock("job", async () => null);
    const first = state.insertedOwner;
    await runWithLock("job", async () => null);
    const second = state.insertedOwner;

    expect(first).not.toBe("");
    expect(second).not.toBe(first);
  });
});

/**
 * The same lock has to work on all three dialects, and they are genuinely
 * different SQL. A lock that only ever gets exercised against SQLite - which is
 * what a developer running the test suite locally will do - can leave the
 * Postgres branch broken until the project is deployed against a real database.
 */
describe.each(["postgresql", "mysql"])("runWithLock on the %s backend", (dialect) => {
  beforeEach(() => {
    state.redisDisabled = true;
    state.dialect = dialect;
  });

  it("runs the handler and releases the lock", async () => {
    const { runWithLock } = await loadLock();
    let ran = false;

    const outcome = await runWithLock("job", async () => {
      ran = true;
      return "done";
    });

    expect(ran).toBe(true);
    expect(outcome.backend).toBe("db");
    expect(state.sql.some((sql) => sql.startsWith("DELETE"))).toBe(true);
  });

  it("quotes the table name the way the dialect expects", async () => {
    const { runWithLock } = await loadLock();

    await runWithLock("job", async () => null, { tableName: "billing_locks" });

    // Backticks on MySQL, double quotes elsewhere. Getting this wrong is a syntax
    // error at the first scheduled run, not at boot.
    const expected = dialect === "mysql" ? "`billing_locks`" : '"billing_locks"';
    expect(state.sql.some((sql) => sql.includes(expected))).toBe(true);
  });

  it("releases the lock when the handler throws", async () => {
    const { runWithLock } = await loadLock();

    await expect(
      runWithLock("job", async () => {
        throw new Error("upstream refused");
      })
    ).rejects.toThrow("upstream refused");

    expect(state.sql.some((sql) => sql.startsWith("DELETE"))).toBe(true);
  });
});
