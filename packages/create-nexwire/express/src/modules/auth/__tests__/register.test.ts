import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/index.js", () => ({
  authConfig: { requireEmailVerification: false }
}));

vi.mock("@/framework/facade.js", () => ({
  db: {
    query: {
      roles: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() }
    },
    transaction: vi.fn()
  },
  dispatchEvent: vi.fn(),
  password: { hashPassword: vi.fn() },
  urls: { url: vi.fn((p: string) => `https://app.test${p}`) }
}));

vi.mock("@/modules/auth/database/models/role.js", () => ({
  roles: { __table: "roles", name: "roles.name" }
}));

vi.mock("@/modules/auth/database/models/user.js", () => ({
  users: { __table: "users", id: "users.id", email: "users.email" },
  emailVerificationTokens: {
    __table: "emailVerificationTokens",
    email: "emailVerificationTokens.email",
    token: "emailVerificationTokens.token",
    expiresAt: "emailVerificationTokens.expiresAt",
    createdAt: "emailVerificationTokens.createdAt"
  }
}));

vi.mock("@/modules/auth/helpers/auth.js", () => ({
  hashEmailVerificationToken: vi.fn((t: string) => `hashed:${t}`),
  makeEmailVerificationToken: vi.fn(() => "plain-verify-token"),
  issueTokens: vi.fn(),
  revokeCurrentRefreshToken: vi.fn(),
  sanitizeUser: vi.fn((u: any) => ({ id: u.id, email: u.email, name: u.name }))
}));

import { authConfig } from "@/config/index.js";
import { db, dispatchEvent, password, urls } from "@/framework/facade.js";
import { issueTokens, revokeCurrentRefreshToken } from "@/modules/auth/helpers/auth.js";
import { registerService } from "@/modules/auth/services/register.js";

const body = { name: "Jane", email: "jane@example.com", password: "secret123" };

const fakeUser = {
  id: 1,
  name: "Jane",
  email: "jane@example.com",
  role: { id: 2, name: "user" }
};

function makeReqRes() {
  const req = {} as Request;
  const res = {} as Response;
  return { req, res };
}

/**
 * Build a fake tx.
 *   - insertedRow: what insert().returning() resolves to
 *   - refetchedUser: what query.users.findFirst returns inside the tx
 */
function buildTx({ insertedRow = { id: 1 } as unknown, refetchedUser = fakeUser as unknown | null } = {}) {
  const insertCalls: { table: unknown; values: unknown }[] = [];
  let currentInsertTable: unknown;

  const txInsertReturning = vi.fn((_args?: unknown) => Promise.resolve(insertedRow ? [insertedRow] : []));
  const txInsertValues = vi.fn((values: unknown) => {
    insertCalls.push({ table: currentInsertTable, values });
    return { returning: txInsertReturning };
  });
  const txInsert = vi.fn((table: unknown) => {
    currentInsertTable = table;
    return { values: txInsertValues };
  });

  const txDeleteWhere = vi.fn((_where: unknown) => Promise.resolve(undefined));
  const txDelete = vi.fn((_table: unknown) => ({ where: txDeleteWhere }));

  const txFindFirst = vi.fn((_args: unknown) => Promise.resolve(refetchedUser));

  return {
    tx: {
      insert: txInsert,
      delete: txDelete,
      query: { users: { findFirst: txFindFirst } }
    },
    txInsert,
    txInsertValues,
    txInsertReturning,
    txDelete,
    txDeleteWhere,
    txFindFirst,
    insertCalls
  };
}

describe("registerService.register (express)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authConfig).requireEmailVerification = false;
    vi.mocked(password.hashPassword).mockResolvedValue("hashed-secret" as any);
    vi.mocked(db.query.roles.findFirst).mockResolvedValue({
      id: 2,
      name: "user"
    } as any);
    vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined as any);
  });

  it("returns email_exists when the email is already taken (no hashing, no tx)", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(fakeUser as any);
    const { req, res } = makeReqRes();

    const result = await registerService.register(req, res, body);

    expect(result).toEqual({
      kind: "email_exists",
      message: "Email already exists"
    });
    expect(password.hashPassword).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("throws if the default 'user' role is missing", async () => {
    vi.mocked(db.query.roles.findFirst).mockResolvedValueOnce(undefined);
    const { req, res } = makeReqRes();

    await expect(registerService.register(req, res, body)).rejects.toThrow('Default role "user" not found');

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("hashes the password BEFORE opening the transaction", async () => {
    const order: string[] = [];
    vi.mocked(password.hashPassword).mockImplementationOnce(async () => {
      order.push("hash");
      return "hashed-secret" as any;
    });

    const { tx } = buildTx();
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => {
      order.push("tx");
      return fn(tx);
    });
    vi.mocked(issueTokens).mockResolvedValueOnce({
      accessToken: "a",
      refreshToken: "r"
    } as any);

    const { req, res } = makeReqRes();
    await registerService.register(req, res, body);

    expect(order).toEqual(["hash", "tx"]);
  });

  it("inserts the user with the hashed password and the default role id", async () => {
    const { tx, insertCalls } = buildTx();
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));
    vi.mocked(issueTokens).mockResolvedValueOnce({
      accessToken: "a",
      refreshToken: "r"
    } as any);
    const { req, res } = makeReqRes();

    await registerService.register(req, res, body);

    const inserted = insertCalls[0].values as any;
    expect(inserted).toMatchObject({
      name: "Jane",
      email: "jane@example.com",
      password: "hashed-secret",
      roleId: 2
    });
    expect(inserted.password).not.toBe("secret123");
  });

  it("registers, issues tokens, and dispatches user:signup WITHOUT the password", async () => {
    const { tx } = buildTx();
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));
    vi.mocked(issueTokens).mockResolvedValueOnce({
      accessToken: "access-123",
      refreshToken: "refresh-456"
    } as any);
    const { req, res } = makeReqRes();

    const result = await registerService.register(req, res, {
      ...body,
      remember: true
    });

    expect(revokeCurrentRefreshToken).toHaveBeenCalledWith(req, res);
    expect(issueTokens).toHaveBeenCalledWith(req, res, fakeUser, {
      remember: true
    });

    // The critical assertion: password must NOT be in the event payload
    expect(dispatchEvent).toHaveBeenCalledWith(
      "user:signup",
      {
        userId: 1,
        email: "jane@example.com",
        name: "Jane"
      },
      { queue: "mail" }
    );

    const [, eventPayload] = vi.mocked(dispatchEvent).mock.calls[0];
    expect(eventPayload).not.toHaveProperty("password");

    expect(result).toEqual({
      kind: "registered",
      message: "User registered successfully",
      data: {
        user: { id: 1, email: "jane@example.com", name: "Jane" },
        access_token: "access-123",
        refresh_token: "refresh-456",
        token_type: "Bearer"
      }
    });
  });

  it("returns verification_required and dispatches user:verify-email when verification is on", async () => {
    vi.mocked(authConfig).requireEmailVerification = true;

    const { tx, insertCalls } = buildTx();
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));
    const { req, res } = makeReqRes();

    const result = await registerService.register(req, res, body);

    expect(result).toEqual({
      kind: "verification_required",
      message: "User registered successfully. Please verify your email before logging in."
    });

    expect(dispatchEvent).toHaveBeenCalledWith(
      "user:verify-email",
      {
        email: "jane@example.com",
        name: "Jane",
        verifyUrl: "https://app.test/verify-email?token=plain-verify-token&email=jane%40example.com"
      },
      { queue: "mail" }
    );

    // No signup event, no tokens
    expect(issueTokens).not.toHaveBeenCalled();
    expect(revokeCurrentRefreshToken).not.toHaveBeenCalled();

    // Second insert (the token) stored the HASH, not the plain token
    const tokenInsert = insertCalls[1].values as any;
    expect(tokenInsert.token).toBe("hashed:plain-verify-token");
    expect(tokenInsert.token).not.toBe("plain-verify-token");
    expect(tokenInsert.email).toBe("jane@example.com");
  });

  it("does not dispatch any email if the transaction fails", async () => {
    vi.mocked(db.transaction).mockRejectedValueOnce(new Error("db down"));
    const { req, res } = makeReqRes();

    await expect(registerService.register(req, res, body)).rejects.toThrow("db down");

    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("throws when the insert returns no row", async () => {
    const { tx } = buildTx({ insertedRow: null });
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));
    const { req, res } = makeReqRes();

    await expect(registerService.register(req, res, body)).rejects.toThrow("Failed to insert user");

    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("throws when the inserted user cannot be re-fetched", async () => {
    const { tx } = buildTx({ refetchedUser: null });
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));
    const { req, res } = makeReqRes();

    await expect(registerService.register(req, res, body)).rejects.toThrow("Inserted user not found");

    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
