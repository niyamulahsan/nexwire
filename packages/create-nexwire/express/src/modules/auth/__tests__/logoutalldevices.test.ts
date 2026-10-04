import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val }))
}));

vi.mock("@/framework/facade.js", () => ({
  db: {
    delete: vi.fn(() => ({ where: vi.fn() }))
  }
}));

vi.mock("@/modules/auth/database/models/user.js", () => ({
  refreshTokens: { __table: "refreshTokens", userId: "refreshTokens.userId" }
}));

import { eq } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { refreshTokens } from "@/modules/auth/database/models/user.js";
import { logoutAllDevicesService } from "@/modules/auth/services/logoutalldevices.js";

describe("logoutAllDevicesService.logoutAllDevices", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes refresh tokens for the given user", async () => {
    await logoutAllDevicesService.logoutAllDevices(42);

    expect(db.delete).toHaveBeenCalledWith(refreshTokens);

    // The where-clause targets refreshTokens.userId with the userId value
    expect(eq).toHaveBeenCalledWith(refreshTokens.userId, 42);

    const whereArg = (db.delete as any).mock.results[0].value.where.mock.calls[0][0] as any;
    expect(whereArg).toEqual({
      op: "eq",
      col: "refreshTokens.userId",
      val: 42
    });
  });

  it("returns logged_out", async () => {
    const result = await logoutAllDevicesService.logoutAllDevices(42);

    expect(result).toEqual({
      kind: "logged_out",
      message: "Logged out from all devices successfully"
    });
  });
});
