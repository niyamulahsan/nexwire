import { cookie, logger } from "@/framework/facade.js";
import { revokeCurrentRefreshToken } from "@/modules/auth/helpers/auth.js";

export type LogoutResult = {
  kind: "logged_out";
  message: string;
};

export const logoutService = {
  logout: async (c: any): Promise<LogoutResult> => {
    try {
      await revokeCurrentRefreshToken(c);
    } catch (err) {
      // Log and continue — the user is logging out either way.
      // The server-side token will expire on its own.
      logger.error("failed to revoke refresh token on logout", { err });
    }

    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);

    return { kind: "logged_out", message: "Logged out successfully" };
  }
};
