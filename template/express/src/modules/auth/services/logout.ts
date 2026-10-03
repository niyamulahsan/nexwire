import type { Request, Response } from "express";
import { cookie, logger } from "@/framework/facade.js";
import { revokeCurrentRefreshToken } from "@/modules/auth/helpers/auth.js";

export type LogoutResult = {
  kind: "logged_out";
  message: string;
};

export const logoutService = {
  logout: async (req: Request, res: Response): Promise<LogoutResult> => {
    try {
      await revokeCurrentRefreshToken(req, res);
    } catch (err) {
      // Log and continue — the user is logging out either way.
      // The server-side token will expire on its own.
      logger.error("failed to revoke refresh token on logout", { err });
    }

    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);

    return { kind: "logged_out", message: "Logged out successfully" };
  }
};
