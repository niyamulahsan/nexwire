import { cookie } from "@/framework/facade.js";
import { revokeCurrentRefreshToken } from "@/modules/auth/helpers/auth.js";

export const logoutService = {
  logout: async (c: any) => {
    await revokeCurrentRefreshToken(c);
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);

    return { kind: "logged_out" as const, message: "Logged out successfully" };
  }
};
