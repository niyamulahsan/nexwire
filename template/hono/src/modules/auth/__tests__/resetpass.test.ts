import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/framework/facade.js", () => ({
  db: {
    query: { users: { findFirst: vi.fn() } },
    transaction: vi.fn()
  },
  password: { hashPassword: vi.fn() }
}));

vi.mock("@/modules/auth/helpers/auth.js", () => ({
  hashResetToken: vi.fn((t: string) => `hashed:${t}`)
}));

vi.mock("@/modules/auth/database/models/user.js", () => ({
  users: { __table: "users", id: "users.id", email: "users.email" },
  passwordResetTokens: {
    __table: "passwordResetTokens",
    email: "passwordResetTokens.email",
    token: "passwordResetTokens.token",
    expiresAt: "passwordResetTokens.expiresAt"
  },
  refreshTokens: { __table: "refreshTokens", userId: "refreshTokens.userId" }
}));

import { db, password } from "@/framework/facade.js";
import { hashResetToken } from "@/modules/auth/helpers/auth.js";
import { resetPasswordService } from "@/modules/auth/services/resetpassword.js";

const fakeUser = { id: 1, email: "user@example.com", name: "Jane" };
const body = {
  email: "user@example.com",
  token: "plain-token",
  password: "new-secret"
};

/**
 * Build a fake `tx`.
 * Options:
 *   - consumeRow: the row returned by delete().returning(), or null for "no match"
 *   - failOnUpdate: 1-indexed update that should reject, or undefined for none
 */
function buildTx({ consumeRow = { id: 1 } as unknown, failOnUpdate }: { consumeRow?: unknown; failOnUpdate?: 1 | 2 } = {}) {
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

describe("resetPasswordService.resetPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query.users.findFirst).mockResolvedValue(fakeUser as any);
    vi.mocked(password.hashPassword).mockResolvedValue("hashed-new-pw" as any);
  });

  it("returns invalid_token without touching the DB when user does not exist", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined);

    const result = await resetPasswordService.resetPassword(body);

    expect(result).toEqual({
      kind: "invalid_token",
      message: "Invalid or expired reset token"
    });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(password.hashPassword).not.toHaveBeenCalled();
  });

  it("returns invalid_token when no reset token row was consumed", async () => {
    const { tx } = buildTx({ consumeRow: null });
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));

    const result = await resetPasswordService.resetPassword(body);

    expect(result).toEqual({
      kind: "invalid_token",
      message: "Invalid or expired reset token"
    });
  });

  it("hashes the password BEFORE opening the transaction", async () => {
    const callOrder: string[] = [];

    vi.mocked(password.hashPassword).mockImplementationOnce(async () => {
      callOrder.push("hashPassword");
      return "hashed-new-pw" as any;
    });

    const { tx } = buildTx();
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => {
      callOrder.push("transaction");
      return fn(tx);
    });

    await resetPasswordService.resetPassword(body);

    expect(callOrder).toEqual(["hashPassword", "transaction"]);
  });

  it("consumes the token by its HASHED value inside the transaction", async () => {
    const { tx, txDelete, txDeleteWhere } = buildTx();
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));

    await resetPasswordService.resetPassword(body);

    expect(hashResetToken).toHaveBeenCalledWith("plain-token");
    expect(txDelete).toHaveBeenCalledTimes(1);

    const whereArg = txDeleteWhere.mock.calls[0][0];
    const serialized = JSON.stringify(whereArg);
    expect(serialized).toContain("hashed:plain-token");
    expect(serialized).not.toContain('"plain-token"');
  });

  it("updates password + revokes sessions inside the same transaction", async () => {
    const { tx, updateCalls } = buildTx();
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));

    const result = await resetPasswordService.resetPassword(body);

    expect(result).toEqual({
      kind: "reset",
      message: "Password reset successfully"
    });

    expect(updateCalls).toHaveLength(2);

    // 1st update: user's password, matched by id
    expect((updateCalls[0].table as any).__table).toBe("users");
    expect(updateCalls[0].values).toEqual({
      password: "hashed-new-pw",
      updatedAt: expect.any(Date)
    });

    // 2nd update: revoke all refresh tokens for this user
    expect((updateCalls[1].table as any).__table).toBe("refreshTokens");
    expect(updateCalls[1].values).toEqual({ revoked: 1 });
  });

  it("returns invalid_token when the transaction fails before consuming", async () => {
    vi.mocked(db.transaction).mockRejectedValueOnce(new Error("db down"));

    const result = await resetPasswordService.resetPassword(body);

    expect(result).toEqual({
      kind: "invalid_token",
      message: "Invalid or expired reset token"
    });
  });

  it("stops at the failing update — second update is never attempted", async () => {
    const { tx, updateCalls } = buildTx({ failOnUpdate: 1 });
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));

    const result = await resetPasswordService.resetPassword(body);

    expect(result).toEqual({
      kind: "invalid_token",
      message: "Invalid or expired reset token"
    });

    expect(updateCalls).toHaveLength(1);
    expect((updateCalls[0].table as any).__table).toBe("users");
    expect(updateCalls.some((c) => (c.table as any).__table === "refreshTokens")).toBe(false);
  });

  it("propagates failure if the 2nd update rejects (session revocation fails)", async () => {
    const { tx, updateCalls } = buildTx({ failOnUpdate: 2 });
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));

    const result = await resetPasswordService.resetPassword(body);

    expect(result).toEqual({
      kind: "invalid_token",
      message: "Invalid or expired reset token"
    });

    expect(updateCalls).toHaveLength(2);
    expect((updateCalls[1].table as any).__table).toBe("refreshTokens");
  });
});
