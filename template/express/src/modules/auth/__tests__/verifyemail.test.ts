import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/index.js", () => ({
  authConfig: { requireEmailVerification: true }
}));

vi.mock("@/framework/facade.js", () => ({
  db: {
    query: { users: { findFirst: vi.fn() } },
    transaction: vi.fn()
  }
}));

vi.mock("@/modules/auth/helpers/auth.js", () => ({
  hashEmailVerificationToken: vi.fn((t: string) => `hashed:${t}`)
}));

vi.mock("@/modules/auth/database/models/user.js", () => ({
  users: { __table: "users", id: "users.id", email: "users.email" },
  emailVerificationTokens: {
    __table: "emailVerificationTokens",
    email: "emailVerificationTokens.email",
    token: "emailVerificationTokens.token",
    expiresAt: "emailVerificationTokens.expiresAt"
  }
}));

import { authConfig } from "@/config/index.js";
import { db } from "@/framework/facade.js";
import { hashEmailVerificationToken } from "@/modules/auth/helpers/auth.js";
import { verifyEmailService } from "@/modules/auth/services/verifyemail.js";

const fakeUser = { id: 1, email: "user@example.com", name: "Jane" };
const body = { email: "user@example.com", token: "plain-verify-token" };

/** The exact result the service returns for every invalid-token path. */
const INVALID_TOKEN = {
  kind: "invalid_token",
  message: "Invalid or expired verification token"
} as const;

/**
 * Build a fake tx.
 *   - consumeRow: row returned by delete().returning(), or null for "no match"
 *   - failOnUpdate: 1-indexed update that rejects (only one update here)
 */
function buildTx({ consumeRow = { id: 1 } as unknown, failOnUpdate }: { consumeRow?: unknown; failOnUpdate?: 1 } = {}) {
  const updateCalls: { table: unknown; values: unknown; where: unknown }[] = [];

  const txDeleteReturning = vi.fn((_args?: unknown) => Promise.resolve(consumeRow ? [consumeRow] : []));
  const txDeleteWhere = vi.fn((_where: unknown) => ({
    returning: txDeleteReturning
  }));
  const txDelete = vi.fn((_table: unknown) => ({ where: txDeleteWhere }));

  const txUpdate = vi.fn((table: unknown) => {
    const callIndex = updateCalls.length + 1;
    let currentValues: unknown;

    const txUpdateWhere = vi.fn((where: unknown) => {
      updateCalls.push({ table, values: currentValues, where });
      if (failOnUpdate === callIndex) {
        return Promise.reject(new Error("constraint violation"));
      }
      return Promise.resolve(undefined);
    });

    const txUpdateSet = vi.fn((values: unknown) => {
      currentValues = values;
      return { where: txUpdateWhere };
    });

    return { set: txUpdateSet };
  });

  return {
    tx: { delete: txDelete, update: txUpdate },
    txDelete,
    txDeleteWhere,
    txDeleteReturning,
    txUpdate,
    updateCalls
  };
}

describe("verifyEmailService.verifyEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authConfig).requireEmailVerification = true;
    vi.mocked(db.query.users.findFirst).mockResolvedValue(fakeUser as any);
  });

  it("returns not_required without touching the DB when verification is disabled", async () => {
    vi.mocked(authConfig).requireEmailVerification = false;

    const result = await verifyEmailService.verifyEmail(body);

    expect(result).toEqual({
      kind: "not_required",
      message: "Email verification is not required"
    });
    expect(db.query.users.findFirst).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns invalid_token when the user does not exist", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined);

    const result = await verifyEmailService.verifyEmail(body);

    expect(result).toEqual(INVALID_TOKEN);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns invalid_token when no token row was consumed", async () => {
    const { tx } = buildTx({ consumeRow: null });
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));

    const result = await verifyEmailService.verifyEmail(body);

    expect(result).toEqual(INVALID_TOKEN);
  });

  it("consumes the token by its HASHED value inside the transaction", async () => {
    const { tx, txDelete, txDeleteWhere } = buildTx();
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));

    await verifyEmailService.verifyEmail(body);

    expect(hashEmailVerificationToken).toHaveBeenCalledWith("plain-verify-token");
    expect(txDelete).toHaveBeenCalledTimes(1);

    const whereArg = txDeleteWhere.mock.calls[0][0];
    const serialized = JSON.stringify(whereArg);
    expect(serialized).toContain("hashed:plain-verify-token");
    expect(serialized).not.toContain('"plain-verify-token"');
  });

  it("marks the user verified by id (not email) inside the transaction", async () => {
    const { tx, updateCalls } = buildTx();
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));

    const result = await verifyEmailService.verifyEmail(body);

    expect(result).toEqual({
      kind: "verified",
      message: "Email verified successfully"
    });

    expect(updateCalls).toHaveLength(1);
    expect((updateCalls[0].table as any).__table).toBe("users");

    const values = updateCalls[0].values as {
      emailVerifiedAt: Date;
      updatedAt: Date;
    };
    expect(values.emailVerifiedAt).toBeInstanceOf(Date);
    expect(values.updatedAt).toBeInstanceOf(Date);

    // Same Date instance for both fields — proves `now` is shared
    expect(values.emailVerifiedAt).toBe(values.updatedAt);
  });

  it("returns invalid_token when the transaction rejects", async () => {
    vi.mocked(db.transaction).mockRejectedValueOnce(new Error("db down"));

    const result = await verifyEmailService.verifyEmail(body);

    expect(result).toEqual(INVALID_TOKEN);
  });

  it("returns invalid_token when the update rejects inside the transaction", async () => {
    const { tx, updateCalls } = buildTx({ failOnUpdate: 1 });
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));

    const result = await verifyEmailService.verifyEmail(body);

    expect(result).toEqual(INVALID_TOKEN);

    expect(updateCalls).toHaveLength(1);
    expect((updateCalls[0].table as any).__table).toBe("users");
  });
});
