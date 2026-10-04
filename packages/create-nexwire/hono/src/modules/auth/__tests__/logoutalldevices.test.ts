import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/framework/facade.js", () => ({
  db: {
    delete: vi.fn(() => ({ where: vi.fn() }))
  }
}));

import { db } from "@/framework/facade.js";
import { refreshTokens } from "@/modules/auth/database/models/user.js";
import { logoutAllDevicesService } from "@/modules/auth/services/logoutalldevices.js";

describe("logoutAllDevicesService.logoutAllDevices", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes all refresh tokens for the given user", async () => {
    await logoutAllDevicesService.logoutAllDevices(42);

    // The service called db.delete(refreshTokens).where(eq(refreshTokens.userId, 42))
    expect(db.delete).toHaveBeenCalledWith(refreshTokens);

    const whereArg = (db.delete as any).mock.results[0].value.where.mock.calls[0][0];
    expect(whereArg).toBeDefined(); // eq() produced *something*
  });

  it("returns logged_out", async () => {
    const result = await logoutAllDevicesService.logoutAllDevices(42);

    expect(result).toEqual({
      kind: "logged_out",
      message: "Logged out from all devices successfully"
    });
  });
});
