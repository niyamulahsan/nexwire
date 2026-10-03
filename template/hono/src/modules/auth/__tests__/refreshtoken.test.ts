import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/index.js", () => ({
  jwtConfig: { refreshRememberExpirySeconds: 60 * 60 * 24 * 30 }
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
  and: vi.fn((...args: unknown[]) => ({ op: "and", args }))
}));

vi.mock("@/framework/facade.js", () => ({
  db: {
    query: {
      refreshTokens: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() }
    },
    delete: vi.fn((_table: unknown) => ({
      where: vi.fn((_where: unknown) => Promise.resolve(undefined))
    })),
    update: vi.fn((_table: unknown) => ({
      set: vi.fn((_values: unknown) => ({
        where: vi.fn((_where: unknown) => ({
          returning: vi.fn((_args?: unknown) => Promise.resolve([]))
        }))
      }))
    }))
  },
  jwt: {
    verifyToken: vi.fn(),
    generateToken: vi.fn()
  }
}));

vi.mock("@/modules/auth/helpers/auth.js", () => ({
  sanitizeUser: vi.fn((u: any) => ({ id: u.id, email: u.email, name: u.name }))
}));

vi.mock("@/modules/auth/database/models/user.js", () => ({
  users: { __table: "users", id: "users.id", email: "users.email" },
  refreshTokens: {
    __table: "refreshTokens",
    id: "refreshTokens.id",
    jti: "refreshTokens.jti",
    userId: "refreshTokens.userId",
    revoked: "refreshTokens.revoked",
    expiresAt: "refreshTokens.expiresAt"
  }
}));

import { db, jwt } from "@/framework/facade.js";
import { refreshTokenService } from "@/modules/auth/services/refreshtoken.js";

const futureDate = new Date(Date.now() + 60_000);
const pastDate = new Date(Date.now() - 60_000);

const storedToken = {
  id: 10,
  jti: "jti-old",
  revoked: 0,
  expiresAt: futureDate
};

const fakeUser = {
  id: 1,
  email: "user@example.com",
  name: "Jane",
  role: { id: 2, name: "user" }
};

/**
 * Wire db.update so its returning() resolves with `rows`.
 * Returns handles to inspect the set/where calls.
 */
function mockRotate(rows: unknown[]) {
  const returning = vi.fn((_args?: unknown) => Promise.resolve(rows));
  const where = vi.fn((_where: unknown) => ({ returning }));
  const set = vi.fn((_values: unknown) => ({ where }));
  const update = vi.fn((_table: unknown) => ({ set }));

  vi.mocked(db.update).mockImplementationOnce(update as any);

  return { update, set, where, returning };
}

/** Wire jwt.generateToken to succeed twice (access then refresh). */
function mockTokenGeneration() {
  vi.mocked(jwt.generateToken)
    .mockResolvedValueOnce({
      token: "new-access",
      exp: 111,
      jti: "access-jti"
    } as any)
    .mockResolvedValueOnce({
      token: "new-refresh",
      exp: 222,
      jti: "refresh-jti"
    } as any);
}

describe("refreshTokenService.refreshToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns invalid_token when jti is missing from the payload", async () => {
    vi.mocked(jwt.verifyToken).mockResolvedValueOnce({ id: 1 } as any);

    const result = await refreshTokenService.refreshToken({ refresh_token: "x" });

    expect(result).toEqual({
      kind: "invalid_token",
      message: "Invalid refresh token"
    });
    expect(db.query.refreshTokens.findFirst).not.toHaveBeenCalled();
  });

  it("returns invalid_token when jti is not a string", async () => {
    vi.mocked(jwt.verifyToken).mockResolvedValueOnce({
      jti: 12345,
      id: 1
    } as any);

    const result = await refreshTokenService.refreshToken({ refresh_token: "x" });

    expect(result.kind).toBe("invalid_token");
    expect(db.query.refreshTokens.findFirst).not.toHaveBeenCalled();
  });

  it("returns invalid_token when id is not a positive integer", async () => {
    vi.mocked(jwt.verifyToken).mockResolvedValueOnce({
      jti: "jti-old",
      id: "not-a-number"
    } as any);

    const result = await refreshTokenService.refreshToken({ refresh_token: "x" });

    expect(result.kind).toBe("invalid_token");
    expect(db.query.refreshTokens.findFirst).not.toHaveBeenCalled();
  });

  it("returns revoked when no stored token matches the jti", async () => {
    vi.mocked(jwt.verifyToken).mockResolvedValueOnce({
      jti: "jti-old",
      id: 1
    } as any);
    vi.mocked(db.query.refreshTokens.findFirst).mockResolvedValueOnce(undefined);

    const result = await refreshTokenService.refreshToken({ refresh_token: "x" });

    expect(result).toEqual({ kind: "revoked", message: "Refresh token revoked" });
  });

  it("returns revoked when the stored token is revoked", async () => {
    vi.mocked(jwt.verifyToken).mockResolvedValueOnce({
      jti: "jti-old",
      id: 1
    } as any);
    vi.mocked(db.query.refreshTokens.findFirst).mockResolvedValueOnce({
      ...storedToken,
      revoked: 1
    } as any);

    const result = await refreshTokenService.refreshToken({ refresh_token: "x" });

    expect(result.kind).toBe("revoked");
  });

  it("returns expired and deletes the row when the token has expired", async () => {
    vi.mocked(jwt.verifyToken).mockResolvedValueOnce({
      jti: "jti-old",
      id: 1
    } as any);
    vi.mocked(db.query.refreshTokens.findFirst).mockResolvedValueOnce({
      ...storedToken,
      expiresAt: pastDate
    } as any);

    const result = await refreshTokenService.refreshToken({ refresh_token: "x" });

    expect(result).toEqual({ kind: "expired", message: "Refresh token expired" });
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns user_not_found when the user has been deleted", async () => {
    vi.mocked(jwt.verifyToken).mockResolvedValueOnce({
      jti: "jti-old",
      id: 1
    } as any);
    vi.mocked(db.query.refreshTokens.findFirst).mockResolvedValueOnce(storedToken as any);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined);

    const result = await refreshTokenService.refreshToken({ refresh_token: "x" });

    expect(result).toEqual({
      kind: "user_not_found",
      message: "User not found"
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rotates the token and returns new cookies on the happy path", async () => {
    vi.mocked(jwt.verifyToken).mockResolvedValueOnce({
      jti: "jti-old",
      id: 1,
      remember: false
    } as any);
    vi.mocked(db.query.refreshTokens.findFirst).mockResolvedValueOnce(storedToken as any);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(fakeUser as any);
    mockTokenGeneration();

    const { update, set, where } = mockRotate([{ id: 10 }]);

    const result = await refreshTokenService.refreshToken({
      refresh_token: "old-token"
    });

    expect(result).toEqual({
      kind: "refreshed",
      message: "Token refreshed successfully",
      data: {
        user: { id: 1, email: "user@example.com", name: "Jane" },
        access_token: "new-access",
        refresh_token: "new-refresh",
        token_type: "Bearer"
      },
      cookies: {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        refreshExpiry: undefined
      }
    });

    // Rotation wrote the new jti + expiry, and cleared revoked
    expect(set).toHaveBeenCalledWith({
      jti: "refresh-jti",
      expiresAt: new Date(222 * 1000),
      revoked: 0
    });

    // The CAS where-clause targets both the row id AND the old jti.
    // With drizzle-orm mocked, `where` receives a plain object.
    const whereArg = where.mock.calls[0][0] as any;
    expect(whereArg.op).toBe("and");

    const eqArgs = whereArg.args.filter((a: any) => a?.op === "eq");
    const idEq = eqArgs.find((c: any) => c.col === "refreshTokens.id");
    const jtiEq = eqArgs.find((c: any) => c.col === "refreshTokens.jti");

    expect(idEq).toBeDefined();
    expect(idEq.val).toBe(10);
    expect(jtiEq).toBeDefined();
    expect(jtiEq.val).toBe("jti-old");

    expect(update).toHaveBeenCalledTimes(1);
  });

  it("uses remember-me expiry when the payload has remember=true", async () => {
    vi.mocked(jwt.verifyToken).mockResolvedValueOnce({
      jti: "jti-old",
      id: 1,
      remember: true
    } as any);
    vi.mocked(db.query.refreshTokens.findFirst).mockResolvedValueOnce(storedToken as any);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(fakeUser as any);
    mockTokenGeneration();
    mockRotate([{ id: 10 }]);

    const result = await refreshTokenService.refreshToken({
      refresh_token: "old-token"
    });

    expect(jwt.generateToken).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 1, email: "user@example.com", remember: true }),
      "refresh",
      60 * 60 * 24 * 30
    );

    if (result.kind === "refreshed") {
      expect(result.cookies.refreshExpiry).toBe(60 * 60 * 24 * 30);
    }
  });

  it("returns revoked when the CAS loses (token already rotated by another request)", async () => {
    vi.mocked(jwt.verifyToken).mockResolvedValueOnce({
      jti: "jti-old",
      id: 1,
      remember: false
    } as any);
    vi.mocked(db.query.refreshTokens.findFirst).mockResolvedValueOnce(storedToken as any);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(fakeUser as any);
    mockTokenGeneration();

    mockRotate([]);

    const result = await refreshTokenService.refreshToken({
      refresh_token: "old-token"
    });

    expect(result).toEqual({
      kind: "revoked",
      message: "Refresh token revoked"
    });
  });
});
