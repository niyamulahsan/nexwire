import { and, eq, gt, lt } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { authConfig, jwtConfig } from "@/config/index.js";
import { cookie, db, dispatchEvent, HttpStatusCodes, jwt, password, urls } from "@/framework/facade.js";
import { roles } from "@/modules/auth/database/models/role.js";
import { emailVerificationTokens, passwordResetTokens, refreshTokens, users } from "@/modules/auth/database/models/user.js";
import {
  hashEmailVerificationToken,
  hashResetToken,
  issueTokens,
  makeEmailVerificationToken,
  makeResetToken,
  revokeCurrentRefreshToken,
  sanitizeUser
} from "./auth.helpers.js";

export const register = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const body = req.body;
    const defaultRole = await db.query.roles.findFirst({
      where: eq(roles.name, "user")
    });
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, body.email)
    });

    if (existingUser) {
      return res.status(HttpStatusCodes.UNPROCESSABLE_ENTITY).json({ message: "Email already exists" });
    }

    const insertResult = await db.insert(users).values({
      name: body.name,
      email: body.email,
      password: await password.hashPassword(body.password),
      roleId: defaultRole?.id ?? null
    });

    const insertedId = Number((insertResult as any)[0]?.insertId ?? (insertResult as any).insertId);
    if (!insertedId) {
      throw new Error("Failed to resolve inserted user id");
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, insertedId),
      with: { role: true }
    });

    if (!user) throw new Error("Inserted user not found");

    if (authConfig.requireEmailVerification) {
      const plainToken = makeEmailVerificationToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.email, user.email));
      await db.insert(emailVerificationTokens).values({
        email: user.email,
        token: hashEmailVerificationToken(plainToken),
        expiresAt,
        createdAt: new Date()
      });

      const verifyUrl = urls.url(`/verify-email?token=${plainToken}&email=${encodeURIComponent(user.email)}`);
      await dispatchEvent("user:verify-email", { email: user.email, name: user.name, verifyUrl }, { queue: "mail" });

      return res
        .status(HttpStatusCodes.CREATED)
        .json({ message: "User registered successfully. Please verify your email before logging in." });
    }

    await revokeCurrentRefreshToken(req, res);
    const tokens = await issueTokens(req, res, user, { remember: !!body.remember });
    await dispatchEvent(
      "user:signup",
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        password: body.password
      },
      { queue: "mail" }
    );

    return res.status(HttpStatusCodes.CREATED).json({
      message: "User registered successfully",
      data: {
        user: sanitizeUser(user),
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_type: "Bearer"
      }
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Failed to register user" });
  }
};

export const login = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const body = req.body;
    const user = await db.query.users.findFirst({ where: eq(users.email, body.email), with: { role: true } });

    if (!user || !(await password.verifyPassword(body.password, user.password))) {
      return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Invalid credentials" });
    }

    if (authConfig.requireEmailVerification && !user.emailVerifiedAt) {
      return res.status(HttpStatusCodes.FORBIDDEN).json({ message: "Please verify your email before logging in" });
    }

    await revokeCurrentRefreshToken(req, res);
    const tokens = await issueTokens(req, res, user, { remember: !!body.remember });

    return res.status(HttpStatusCodes.OK).json({
      message: "User logged in successfully",
      data: {
        user: sanitizeUser(user),
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_type: "Bearer"
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Failed to login" });
  }
};

export const me = async (_req: Request, res: Response, _next: NextFunction) => {
  try {
    const auth = res.locals.auth as { id: number; } | undefined;
    const user = await db.query.users.findFirst({
      where: eq(users.id, auth.id),
      with: { role: true }
    });

    if (!user) return res.status(HttpStatusCodes.NOT_FOUND).json({ message: "User not found" });

    return res.status(HttpStatusCodes.OK).json({
      message: "Authenticated user fetched successfully",
      data: sanitizeUser(user)
    });
  } catch (error) {
    console.error("Me error:", error);
    return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Failed to fetch user" });
  }
};

export const logout = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    await revokeCurrentRefreshToken(req, res);
    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);
    return res.status(HttpStatusCodes.OK).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);
    return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Failed to logout" });
  }
};

export const forgotPassword = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const body = req.body;
    await db
      .delete(passwordResetTokens)
      .where(and(eq(passwordResetTokens.email, body.email), lt(passwordResetTokens.expiresAt, new Date())));

    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email)
    });

    if (!user) return res.status(HttpStatusCodes.OK).json({ message: "Reset link has been sent" });

    const plainToken = makeResetToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.email, user.email));
    await db.insert(passwordResetTokens).values({
      email: user.email,
      token: hashResetToken(plainToken),
      expiresAt,
      createdAt: new Date()
    });

    const resetUrl = urls.url(`/reset-password?token=${plainToken}&email=${encodeURIComponent(user.email)}`);
    await dispatchEvent("user:forget-password", { email: user.email, name: user.name, resetUrl }, { queue: "mail" });

    return res.status(HttpStatusCodes.OK).json({ message: "Reset link passed" });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Failed to process forgot password request" });
  }
};

export const resetPassword = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const body = req.body;
    const record = await db.query.passwordResetTokens.findFirst({
      where: and(
        eq(passwordResetTokens.email, body.email),
        eq(passwordResetTokens.token, hashResetToken(body.token)),
        gt(passwordResetTokens.expiresAt, new Date())
      )
    });

    if (!record) {
      return res.status(HttpStatusCodes.UNPROCESSABLE_ENTITY).json({ message: "Invalid or expired reset token" });
    }

    await db
      .update(users)
      .set({
        password: await password.hashPassword(body.password),
        updatedAt: new Date()
      })
      .where(eq(users.email, body.email));

    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.email, body.email));

    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email)
    });
    if (user) await db.update(refreshTokens).set({ revoked: 1 }).where(eq(refreshTokens.userId, user.id));

    return res.status(HttpStatusCodes.OK).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Failed to reset password" });
  }
};

export const verifyEmail = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const body = req.body;

    if (!authConfig.requireEmailVerification) {
      return res.status(HttpStatusCodes.OK).json({ message: "Email verification is not required" });
    }

    const record = await db.query.emailVerificationTokens.findFirst({
      where: and(
        eq(emailVerificationTokens.email, body.email),
        eq(emailVerificationTokens.token, hashEmailVerificationToken(body.token)),
        gt(emailVerificationTokens.expiresAt, new Date())
      )
    });

    if (!record) {
      return res.status(HttpStatusCodes.UNPROCESSABLE_ENTITY).json({ message: "Invalid or expired verification token" });
    }

    await db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.email, body.email));
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.email, body.email));

    return res.status(HttpStatusCodes.OK).json({ message: "Email verified successfully" });
  } catch (error) {
    console.error("Verify email error:", error);
    return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Failed to verify email" });
  }
};

export const refreshToken = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const body = req.body;
    const payload = await jwt.verifyToken(body.refresh_token, "refresh");

    if (!payload?.jti) return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Invalid refresh token" });

    const storedToken = await db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.jti, payload.jti as string)
    });

    if (!storedToken || storedToken.revoked === 1) {
      return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Refresh token revoked" });
    }

    if (storedToken.expiresAt.getTime() < Date.now()) {
      await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));
      return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Refresh token expired" });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.id as number),
      with: { role: true }
    });
    if (!user) return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "User not found" });

    const remember = !!payload.remember;
    const refreshExpiry = remember ? jwtConfig.refreshRememberExpirySeconds : undefined;
    const accessToken = await jwt.generateToken(
      {
        id: user.id,
        email: user.email,
        roleId: user.role?.id,
        role: user.role?.name,
        remember
      },
      "access"
    );
    const newRefreshToken = await jwt.generateToken(
      {
        id: user.id,
        email: user.email,
        roleId: user.role?.id,
        role: user.role?.name,
        remember
      },
      "refresh",
      refreshExpiry
    );

    await db
      .update(refreshTokens)
      .set({
        jti: newRefreshToken.jti as string,
        expiresAt: new Date(newRefreshToken.exp * 1000),
        revoked: 0
      })
      .where(eq(refreshTokens.id, storedToken.id));

    await cookie.setAuth(res, accessToken.token);
    await cookie.setRefresh(res, newRefreshToken.token, refreshExpiry);

    return res.status(HttpStatusCodes.OK).json({
      message: "Token refreshed successfully",
      data: {
        user: sanitizeUser(user),
        access_token: accessToken.token,
        refresh_token: newRefreshToken.token,
        token_type: "Bearer"
      }
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Invalid or expired refresh token" });
  }
};

export const logoutAllDevices = async (_req: Request, res: Response, _next: NextFunction) => {
  try {
    const auth = res.locals.auth as { id: number; } | undefined;

    if (!auth) return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Unauthorized" });

    await db.delete(refreshTokens).where(eq(refreshTokens.userId, auth.id));
    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);

    return res.status(HttpStatusCodes.OK).json({ message: "Logged out from all devices successfully" });
  } catch (error) {
    console.error("Logout all devices error:", error);
    return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Failed to logout from all devices" });
  }
};
