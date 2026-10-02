import { eq } from "drizzle-orm";
import { authConfig } from "@/config/index.js";
import { db, password } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { issueTokens, revokeCurrentRefreshToken, sanitizeUser } from "@/modules/auth/helpers/auth.js";
import { LoginInput } from "@/modules/auth/types/auth.js";

export const loginService = {
  login: async (c: any, body: LoginInput) => {
    const user = await db.query.users.findFirst({ where: eq(users.email, body.email), with: { role: true } });

    if (!user || !(await password.verifyPassword(body.password, user.password))) {
      return { kind: "invalid_credentials" as const, message: "Invalid credentials" };
    }

    if (authConfig.requireEmailVerification && !user.emailVerifiedAt) {
      return { kind: "email_not_verified" as const, message: "Please verify your email before logging in" };
    }

    await revokeCurrentRefreshToken(c);
    const tokens = await issueTokens(c, user, { remember: !!body.remember });

    return {
      kind: "logged_in" as const,
      message: "User logged in successfully",
      data: {
        user: sanitizeUser(user),
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_type: "Bearer"
      }
    };
  }
};
