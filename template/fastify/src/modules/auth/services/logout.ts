// ./src/modules/auth/services/logout.ts

import type { FastifyReply, FastifyRequest } from "fastify";
import { cookie, logger } from "@/framework/facade.js";
import { revokeCurrentRefreshToken } from "@/modules/auth/helpers/auth.js";

export type LogoutResult = {
  kind: "logged_out";
  message: string;
};

export const logoutService = {
  async logout(req: FastifyRequest, reply: FastifyReply): Promise<LogoutResult> {
    try {
      await revokeCurrentRefreshToken(req);
    } catch (err) {
      // Log and continue — the user is logging out either way.
      // The server-side token will expire on its own.
      logger.error("failed to revoke refresh token on logout", { err });
    }

    cookie.deleteAuth(reply);
    cookie.deleteRefresh(reply);

    return { kind: "logged_out", message: "Logged out successfully" };
  }
};
