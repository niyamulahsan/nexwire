import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/framework/facade.js", () => ({
  cookie: {
    deleteAuth: vi.fn(),
    deleteRefresh: vi.fn()
  },
  logger: {
    error: vi.fn()
  }
}));

vi.mock("@/modules/auth/helpers/auth.js", () => ({
  revokeCurrentRefreshToken: vi.fn()
}));

import { cookie, logger } from "@/framework/facade.js";
import { revokeCurrentRefreshToken } from "@/modules/auth/helpers/auth.js";
import { logoutService } from "@/modules/auth/services/logout.js";

function makeReqRes() {
  const req = {} as Request;
  const res = {} as Response;
  return { req, res };
}

describe("logoutService.logout (express)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revokes the refresh token and clears cookies", async () => {
    const { req, res } = makeReqRes();

    const result = await logoutService.logout(req, res);

    expect(revokeCurrentRefreshToken).toHaveBeenCalledWith(req, res);
    expect(cookie.deleteAuth).toHaveBeenCalledWith(res);
    expect(cookie.deleteRefresh).toHaveBeenCalledWith(res);
    expect(result).toEqual({
      kind: "logged_out",
      message: "Logged out successfully"
    });
  });

  it("still clears cookies and returns success if revoke throws", async () => {
    const err = new Error("db down");
    vi.mocked(revokeCurrentRefreshToken).mockRejectedValueOnce(err);

    const { req, res } = makeReqRes();
    const result = await logoutService.logout(req, res);

    expect(cookie.deleteAuth).toHaveBeenCalledWith(res);
    expect(cookie.deleteRefresh).toHaveBeenCalledWith(res);
    expect(logger.error).toHaveBeenCalledWith("failed to revoke refresh token on logout", { err });
    expect(result).toEqual({
      kind: "logged_out",
      message: "Logged out successfully"
    });
  });
});
