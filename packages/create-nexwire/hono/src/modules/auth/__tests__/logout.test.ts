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

describe("logoutService.logout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revokes the refresh token and clears cookies", async () => {
    const ctx = { id: "ctx" } as any;

    const result = await logoutService.logout(ctx);

    expect(revokeCurrentRefreshToken).toHaveBeenCalledWith(ctx);
    expect(cookie.deleteAuth).toHaveBeenCalledWith(ctx);
    expect(cookie.deleteRefresh).toHaveBeenCalledWith(ctx);
    expect(result).toEqual({
      kind: "logged_out",
      message: "Logged out successfully"
    });
  });

  it("still clears cookies and returns success if revoke throws", async () => {
    const err = new Error("db down");
    vi.mocked(revokeCurrentRefreshToken).mockRejectedValueOnce(err);

    const ctx = { id: "ctx" } as any;
    const result = await logoutService.logout(ctx);

    expect(cookie.deleteAuth).toHaveBeenCalledWith(ctx);
    expect(cookie.deleteRefresh).toHaveBeenCalledWith(ctx);
    expect(logger.error).toHaveBeenCalledWith("failed to revoke refresh token on logout", { err });
    expect(result).toEqual({
      kind: "logged_out",
      message: "Logged out successfully"
    });
  });
});
