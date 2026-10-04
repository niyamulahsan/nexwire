import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/index.js", () => ({
  authConfig: { requireEmailVerification: false }
}));

vi.mock("@/framework/facade.js", () => ({
  db: { query: { users: { findFirst: vi.fn() } } },
  password: { verifyPassword: vi.fn() }
}));

vi.mock("@/modules/auth/helpers/auth.js", () => ({
  issueTokens: vi.fn(),
  revokeCurrentRefreshToken: vi.fn(),
  sanitizeUser: vi.fn((u: any) => ({ id: u.id, email: u.email, name: u.name }))
}));

import { authConfig } from "@/config/index.js";
import { db, password } from "@/framework/facade.js";
import { issueTokens, revokeCurrentRefreshToken } from "@/modules/auth/helpers/auth.js";
import { loginService } from "@/modules/auth/services/login.js";

const fakeUser = {
  id: 1,
  email: "user@example.com",
  name: "Jane",
  password: "hashed-pw",
  emailVerifiedAt: new Date()
};

const body = { email: "user@example.com", password: "pw" };

/** Minimal fake req/res. The service just passes them through. */
function makeReqRes() {
  const req = {} as Request;
  const res = {} as Response;
  return { req, res };
}

describe("loginService.login (express)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authConfig).requireEmailVerification = false;
  });

  it("returns invalid_credentials when the user does not exist (no hash attempt)", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined);
    const { req, res } = makeReqRes();

    const result = await loginService.login(req, res, body);

    expect(result).toEqual({
      kind: "invalid_credentials",
      message: "Invalid credentials"
    });
    expect(password.verifyPassword).not.toHaveBeenCalled();
    expect(issueTokens).not.toHaveBeenCalled();
    expect(revokeCurrentRefreshToken).not.toHaveBeenCalled();
  });

  it("returns invalid_credentials when the password is wrong", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(fakeUser as any);
    vi.mocked(password.verifyPassword).mockResolvedValueOnce(false);
    const { req, res } = makeReqRes();

    const result = await loginService.login(req, res, body);

    expect(result).toEqual({
      kind: "invalid_credentials",
      message: "Invalid credentials"
    });
    expect(password.verifyPassword).toHaveBeenCalledWith("pw", "hashed-pw");
    expect(issueTokens).not.toHaveBeenCalled();
  });

  it("returns email_not_verified when verification is required and the email is not verified", async () => {
    vi.mocked(authConfig).requireEmailVerification = true;
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce({
      ...fakeUser,
      emailVerifiedAt: null
    } as any);
    vi.mocked(password.verifyPassword).mockResolvedValueOnce(true);
    const { req, res } = makeReqRes();

    const result = await loginService.login(req, res, body);

    expect(result).toEqual({
      kind: "email_not_verified",
      message: "Please verify your email before logging in"
    });
    expect(issueTokens).not.toHaveBeenCalled();
    expect(revokeCurrentRefreshToken).not.toHaveBeenCalled();
  });

  it("does NOT check email verification when the feature is disabled", async () => {
    vi.mocked(authConfig).requireEmailVerification = false;
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce({
      ...fakeUser,
      emailVerifiedAt: null
    } as any);
    vi.mocked(password.verifyPassword).mockResolvedValueOnce(true);
    vi.mocked(issueTokens).mockResolvedValueOnce({
      accessToken: "a",
      refreshToken: "r"
    } as any);
    const { req, res } = makeReqRes();

    const result = await loginService.login(req, res, body);

    expect(result.kind).toBe("logged_in");
  });

  it("logs in successfully and passes req/res through to the helpers", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(fakeUser as any);
    vi.mocked(password.verifyPassword).mockResolvedValueOnce(true);
    vi.mocked(issueTokens).mockResolvedValueOnce({
      accessToken: "access-123",
      refreshToken: "refresh-456"
    } as any);
    const { req, res } = makeReqRes();

    const result = await loginService.login(req, res, {
      ...body,
      remember: true
    });

    // The Express-specific contract: req and res are forwarded as-is.
    expect(revokeCurrentRefreshToken).toHaveBeenCalledWith(req, res);
    expect(issueTokens).toHaveBeenCalledWith(req, res, fakeUser, {
      remember: true
    });

    expect(result).toEqual({
      kind: "logged_in",
      message: "User logged in successfully",
      data: {
        user: { id: 1, email: "user@example.com", name: "Jane" },
        access_token: "access-123",
        refresh_token: "refresh-456",
        token_type: "Bearer"
      }
    });
  });

  it("coerces a missing remember flag to false", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(fakeUser as any);
    vi.mocked(password.verifyPassword).mockResolvedValueOnce(true);
    vi.mocked(issueTokens).mockResolvedValueOnce({
      accessToken: "a",
      refreshToken: "r"
    } as any);
    const { req, res } = makeReqRes();

    await loginService.login(req, res, body);

    expect(issueTokens).toHaveBeenCalledWith(req, res, fakeUser, {
      remember: false
    });
  });

  it("does not issue tokens when credentials are invalid", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined);
    const { req, res } = makeReqRes();

    await loginService.login(req, res, body);

    expect(revokeCurrentRefreshToken).not.toHaveBeenCalled();
    expect(issueTokens).not.toHaveBeenCalled();
  });
});
