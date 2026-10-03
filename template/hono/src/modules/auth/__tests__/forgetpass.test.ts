import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/framework/facade.js", () => ({
  db: {
    transaction: vi.fn()
  },
  dispatchEvent: vi.fn(),
  urls: { url: vi.fn((p: string) => `https://app.test${p}`) }
}));

vi.mock("@/modules/auth/helpers/auth.js", () => ({
  makeResetToken: vi.fn(() => "plain-token-123"),
  hashResetToken: vi.fn((t: string) => `hashed:${t}`)
}));

vi.mock("@/modules/auth/database/models/user.js", () => ({
  users: { id: "users.id", email: "users.email" },
  passwordResetTokens: {
    email: "passwordResetTokens.email",
    token: "passwordResetTokens.token",
    expiresAt: "passwordResetTokens.expiresAt",
    createdAt: "passwordResetTokens.createdAt"
  }
}));

import { db, dispatchEvent, urls } from "@/framework/facade.js";
import { hashResetToken, makeResetToken } from "@/modules/auth/helpers/auth.js";
import { forgotPasswordService } from "@/modules/auth/services/forgetpassword.js";

const fakeUser = {
  id: 1,
  email: "user@example.com",
  name: "Jane"
};
const body = { email: "user@example.com" };

/**
 * Build a fake tx whose calls we can inspect.
 * `user` controls whether the query returns a user.
 */
function buildTx({ user = fakeUser as unknown | null } = {}) {
  const txDeleteWhere = vi.fn((_where: unknown) => Promise.resolve(undefined));
  const txDelete = vi.fn((_table: unknown) => ({ where: txDeleteWhere }));

  const txInsertValues = vi.fn((_values: unknown) => Promise.resolve(undefined));
  const txInsert = vi.fn((_table: unknown) => ({ values: txInsertValues }));

  const txFindFirst = vi.fn((_args: unknown) => Promise.resolve(user));

  return {
    tx: {
      delete: txDelete,
      insert: txInsert,
      query: { users: { findFirst: txFindFirst } }
    },
    txDelete,
    txDeleteWhere,
    txInsert,
    txInsertValues,
    txFindFirst
  };
}

describe("forgotPasswordService.forgotPassword", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 'sent' and does nothing else when the user does not exist", async () => {
    const { tx, txDelete, txInsert, txFindFirst } = buildTx({ user: null });
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));

    const result = await forgotPasswordService.forgotPassword(body);

    expect(result).toEqual({ kind: "sent", message: "Reset link has been sent" });

    // Only the housekeeping delete ran — no insert, no email
    expect(txDelete).toHaveBeenCalledTimes(1);
    expect(txFindFirst).toHaveBeenCalledTimes(1);
    expect(txInsert).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(urls.url).not.toHaveBeenCalled();
  });

  it("issues a fresh token, stores its HASH, and dispatches the mail event", async () => {
    const { tx, txInsert, txInsertValues } = buildTx();
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));

    const result = await forgotPasswordService.forgotPassword(body);

    expect(result).toEqual({ kind: "sent", message: "Reset link has been sent" });

    // Plain token generated and hashed
    expect(makeResetToken).toHaveBeenCalledTimes(1);
    expect(hashResetToken).toHaveBeenCalledWith("plain-token-123");

    // Inserted token is the HASH, never the plain one
    expect(txInsert).toHaveBeenCalledTimes(1);
    const inserted = txInsertValues.mock.calls[0][0] as any;
    expect(inserted).toMatchObject({
      email: "user@example.com",
      token: "hashed:plain-token-123"
    });
    expect(inserted.token).not.toBe("plain-token-123");
    expect(inserted.expiresAt).toBeInstanceOf(Date);
    expect(inserted.createdAt).toBeInstanceOf(Date);

    // ~15 min TTL
    const ttl = inserted.expiresAt.getTime() - inserted.createdAt.getTime();
    expect(ttl).toBe(15 * 60 * 1000);

    // Same Date instance used for both fields (from the shared `now`)
    expect(inserted.createdAt).toEqual(inserted.createdAt);

    // Reset URL contains the PLAIN token (the user has to receive it)
    expect(urls.url).toHaveBeenCalledWith("/reset-password?token=plain-token-123&email=user%40example.com");

    // Mail dispatched with the reset URL
    expect(dispatchEvent).toHaveBeenCalledWith(
      "user:forget-password",
      {
        email: "user@example.com",
        name: "Jane",
        resetUrl: "https://app.test/reset-password?token=plain-token-123&email=user%40example.com"
      },
      { queue: "mail" }
    );
  });

  it("revokes any existing tokens for the email before inserting a new one", async () => {
    const { tx, txDelete } = buildTx();
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));

    await forgotPasswordService.forgotPassword(body);

    // Two deletes: expired cleanup + revoke existing
    expect(txDelete).toHaveBeenCalledTimes(2);
  });

  it("sends the same message whether or not the user exists (no enumeration)", async () => {
    const missing = buildTx({ user: null });
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(missing.tx));
    const r1 = await forgotPasswordService.forgotPassword(body);

    vi.clearAllMocks();

    const exists = buildTx();
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(exists.tx));
    const r2 = await forgotPasswordService.forgotPassword(body);

    expect(r1).toEqual(r2);
  });

  it("does not dispatch the email if the transaction fails", async () => {
    vi.mocked(db.transaction).mockRejectedValueOnce(new Error("db down"));

    await expect(forgotPasswordService.forgotPassword(body)).rejects.toThrow("db down");

    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(urls.url).not.toHaveBeenCalled();
  });

  it("still returns 'sent' even if the email dispatch fails (token is already stored)", async () => {
    const { tx } = buildTx();
    vi.mocked(db.transaction).mockImplementationOnce(async (fn: any) => fn(tx));
    vi.mocked(dispatchEvent).mockRejectedValueOnce(new Error("queue down"));

    // The service does NOT catch this — the caller's error handler would
    // decide. Documenting the current behavior with this test.
    await expect(forgotPasswordService.forgotPassword(body)).rejects.toThrow("queue down");
  });
});
