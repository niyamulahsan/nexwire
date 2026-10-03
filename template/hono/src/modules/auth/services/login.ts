import { eq } from "drizzle-orm";
import { authConfig } from "@/config/index.js";
import { db, password } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { issueTokens, revokeCurrentRefreshToken, sanitizeUser } from "@/modules/auth/helpers/auth.js";
import type { LoginInput } from "@/modules/auth/types/auth.js";

export type LoginResult =
  | { kind: "invalid_credentials"; message: string }
  | { kind: "email_not_verified"; message: string }
  | {
      kind: "logged_in";
      message: string;
      data: {
        user: ReturnType<typeof sanitizeUser>;
        access_token: string;
        refresh_token: string;
        token_type: "Bearer";
      };
    };

export const loginService = {
  login: async (c: any, body: LoginInput): Promise<LoginResult> => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email),
      with: { role: true }
    });

    // Generic message for both "user missing" and "wrong password" —
    // never tell an attacker which one it was.
    const passwordOk = user && (await password.verifyPassword(body.password, user.password));

    if (!user || !passwordOk) {
      return { kind: "invalid_credentials", message: "Invalid credentials" };
    }

    if (authConfig.requireEmailVerification && !user.emailVerifiedAt) {
      return {
        kind: "email_not_verified",
        message: "Please verify your email before logging in"
      };
    }

    // Rotate the current refresh token before issuing a new pair.
    // If this fails, we do NOT want to leave stale tokens around.
    await revokeCurrentRefreshToken(c);

    const tokens = await issueTokens(c, user, { remember: !!body.remember });

    return {
      kind: "logged_in",
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
