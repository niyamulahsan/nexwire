import type { Request, Response } from "express";
import { revokeCurrentRefreshToken } from "@/modules/auth/helpers/auth.js";

export type LogoutResult = { message: string };

export const logoutService = {
  logout: async (req: Request, res: Response): Promise<LogoutResult> => {
    await revokeCurrentRefreshToken(req, res);
    return { message: "Logged out successfully" };
  }
};
