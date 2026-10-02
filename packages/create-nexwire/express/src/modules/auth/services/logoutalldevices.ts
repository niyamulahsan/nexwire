import { eq } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { refreshTokens } from "@/modules/auth/database/models/user.js";

export type LogoutAllDevicesResult = { message: string };

export const logoutAllDevicesService = {
  logoutAllDevices: async (userId: number): Promise<LogoutAllDevicesResult> => {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));

    return { message: "Logged out from all devices successfully" };
  }
};
