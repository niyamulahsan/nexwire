import { eq } from "drizzle-orm";
import { jwtConfig } from "@/config/index.js";
import { db, jwt } from "@/framework/facade.js";
import { refreshTokens, users } from "@/modules/auth/database/models/user.js";
import { sanitizeUser } from "@/modules/auth/helpers/auth.js";
import { RefreshTokenInput } from "@/modules/auth/types/auth.js";

export type RefreshTokenResult =
  | { kind: "invalid_token"; message: string }
  | { kind: "revoked"; message: string }
  | { kind: "expired"; message: string }
  | { kind: "user_not_found"; message: string }
  | {
      kind: "refreshed";
      message: string;
      data: {
        user: ReturnType<typeof sanitizeUser>;
        access_token: string;
        refresh_token: string;
        token_type: "Bearer";
      };
      cookies: {
        accessToken: string;
        refreshToken: string;
        refreshExpiry?: number;
      };
    };

export const refreshTokenService = {
  refreshToken: async (body: RefreshTokenInput): Promise<RefreshTokenResult> => {
    const payload = await jwt.verifyToken(body.refresh_token, "refresh");

    if (!payload?.jti) {
      return { kind: "invalid_token", message: "Invalid refresh token" };
    }

    const storedToken = await db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.jti, payload.jti as string)
    });

    if (!storedToken || storedToken.revoked === 1) {
      return { kind: "revoked", message: "Refresh token revoked" };
    }

    if (storedToken.expiresAt.getTime() < Date.now()) {
      await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));
      return { kind: "expired", message: "Refresh token expired" };
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.id as number),
      with: { role: true }
    });

    if (!user) {
      return { kind: "user_not_found", message: "User not found" };
    }

    const remember = !!payload.remember;
    const refreshExpiry = remember ? jwtConfig.refreshRememberExpirySeconds : undefined;

    const tokenPayload = {
      id: user.id,
      email: user.email,
      roleId: user.role?.id,
      role: user.role?.name,
      remember
    };

    const accessToken = await jwt.generateToken(tokenPayload, "access");
    const newRefreshToken = await jwt.generateToken(tokenPayload, "refresh", refreshExpiry);

    await db
      .update(refreshTokens)
      .set({
        jti: newRefreshToken.jti as string,
        expiresAt: new Date(newRefreshToken.exp * 1000),
        revoked: 0
      })
      .where(eq(refreshTokens.id, storedToken.id));

    return {
      kind: "refreshed",
      message: "Token refreshed successfully",
      data: {
        user: sanitizeUser(user),
        access_token: accessToken.token,
        refresh_token: newRefreshToken.token,
        token_type: "Bearer"
      },
      cookies: {
        accessToken: accessToken.token,
        refreshToken: newRefreshToken.token,
        refreshExpiry
      }
    };
  }
};
