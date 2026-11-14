// ./src/modules/auth/services/logoutalldevices.ts

import { eq } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { refreshTokens } from "@/modules/auth/database/models/user.js";

export type LogoutAllDevicesResult = {
  kind: "logged_out";
  message: string;
};

export const logoutAllDevicesService = {
  async logoutAllDevices(userId: number): Promise<LogoutAllDevicesResult> {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));

    return {
      kind: "logged_out",
      message: "Logged out from all devices successfully"
    };
  }
};
