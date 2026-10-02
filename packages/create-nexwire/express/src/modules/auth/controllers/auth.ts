import type { NextFunction, Request, Response } from "express";
import { cookie, HttpStatusCodes } from "@/framework/facade.js";
import { registerService } from "@/modules/auth/services/register.js";
import {
  ForgotPasswordInput,
  LoginInput,
  RefreshTokenInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput
} from "@/modules/auth/types/auth.js";
import { forgotPasswordService } from "../services/forgetpassword.js";
import { loginService } from "../services/login.js";
import { logoutService } from "../services/logout.js";
import { logoutAllDevicesService } from "../services/logoutalldevices.js";
import { meService } from "../services/me.js";
import { refreshTokenService } from "../services/refreshtoken.js";
import { resetPasswordService } from "../services/resetpassword.js";
import { verifyEmailService } from "../services/verifyemail.js";

/**
 * Why: Creates a new user, issues tokens, and triggers signup side effects.
 * When: Used on first-time account creation.
 * Where: POST auth register route.
 */
export const register = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const body = req.body as RegisterInput;
    const result = await registerService.register(req, res, body);

    switch (result.kind) {
      case "email_exists":
        return res.status(HttpStatusCodes.UNPROCESSABLE_ENTITY).json({ message: result.message });

      case "verification_required":
        return res.status(HttpStatusCodes.CREATED).json({ message: result.message });

      case "registered":
        return res.status(HttpStatusCodes.CREATED).json({
          message: result.message,
          data: result.data
        });
    }
  } catch (error) {
    console.error("Register error:", error);
    return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Failed to register user" });
  }
};

/**
 * Why: Authenticates user credentials and rotates active login cookies/tokens.
 * When: Used whenever a user signs in.
 * Where: POST auth login route.
 */
export const login = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const body = req.body as LoginInput;
    const result = await loginService.login(req, res, body);

    switch (result.kind) {
      case "invalid_credentials":
        return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: result.message });

      case "email_not_verified":
        return res.status(HttpStatusCodes.FORBIDDEN).json({ message: result.message });

      case "logged_in":
        return res.status(HttpStatusCodes.OK).json({
          message: result.message,
          data: result.data
        });
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Failed to login" });
  }
};

/**
 * Why: Returns the currently authenticated user profile.
 * When: Used by clients to bootstrap session/user state.
 * Where: GET auth me route.
 */
export const me = async (_req: Request, res: Response, _next: NextFunction) => {
  try {
    const auth = res.locals.auth as { id: number } | undefined;
    const result = await meService.me(auth!.id);

    switch (result.kind) {
      case "not_found":
        return res.status(HttpStatusCodes.NOT_FOUND).json({ message: result.message });

      case "found":
        return res.status(HttpStatusCodes.OK).json({
          message: result.message,
          data: result.data
        });
    }
  } catch (error) {
    console.error("Me error:", error);
    return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Failed to fetch user" });
  }
};

/**
 * Why: Revokes current refresh token and clears auth cookies.
 * When: Used when the active device logs out.
 * Where: POST auth logout route.
 */
export const logout = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const result = await logoutService.logout(req, res);

    // cookie cleanup is an HTTP concern — stays in the controller
    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);

    return res.status(HttpStatusCodes.OK).json({ message: result.message });
  } catch (error) {
    console.error("Logout error:", error);

    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);

    return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Failed to logout" });
  }
};

/**
 * Why: Starts password reset flow and queues email delivery event.
 * When: Used when user requests a forgot-password link.
 * Where: POST auth forgot-password route.
 */
export const forgotPassword = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const body = req.body as ForgotPasswordInput;
    const result = await forgotPasswordService.forgotPassword(body);

    // Single success path — intentionally identical whether or not the email exists.
    return res.status(HttpStatusCodes.OK).json({ message: result.message });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Failed to process forgot password request" });
  }
};

/**
 * Why: Verifies reset token and persists the new password.
 * When: Used after user submits reset token + new password.
 * Where: POST auth reset-password route.
 */
export const resetPassword = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const body = req.body as ResetPasswordInput;
    const result = await resetPasswordService.resetPassword(body);

    switch (result.kind) {
      case "invalid_token":
        return res.status(HttpStatusCodes.UNPROCESSABLE_ENTITY).json({ message: result.message });

      case "reset":
        return res.status(HttpStatusCodes.OK).json({ message: result.message });
    }
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Failed to reset password" });
  }
};

/**
 * Why: Validates email verification token and marks user as verified.
 * When: Used when user opens verification link from inbox.
 * Where: POST auth verify-email route.
 */
export const verifyEmail = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const body = req.body as VerifyEmailInput;
    const result = await verifyEmailService.verifyEmail(body);

    switch (result.kind) {
      case "not_required":
        return res.status(HttpStatusCodes.OK).json({ message: result.message });

      case "invalid_token":
        return res.status(HttpStatusCodes.UNPROCESSABLE_ENTITY).json({ message: result.message });

      case "verified":
        return res.status(HttpStatusCodes.OK).json({ message: result.message });
    }
  } catch (error) {
    console.error("Verify email error:", error);
    return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Failed to verify email" });
  }
};

/**
 * Why: Rotates refresh token and reissues access credentials.
 * When: Used when access token expires but refresh token is still valid.
 * Where: POST auth refresh-token route.
 */
export const refreshToken = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const body = req.body as RefreshTokenInput;
    const result = await refreshTokenService.refreshToken(body);

    switch (result.kind) {
      case "invalid_token":
      case "revoked":
      case "expired":
      case "user_not_found":
        return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: result.message });

      case "refreshed": {
        // Cookie handling stays in the controller — it's an HTTP concern.
        await cookie.setAuth(res, result.cookies.accessToken);
        await cookie.setRefresh(res, result.cookies.refreshToken, result.cookies.refreshExpiry);

        return res.status(HttpStatusCodes.OK).json({
          message: result.message,
          data: result.data
        });
      }
    }
  } catch (error) {
    console.error("Refresh token error:", error);
    return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Invalid or expired refresh token" });
  }
};

/**
 * Why: Revokes all refresh tokens for account-wide logout.
 * When: Used for "logout from all devices" security action.
 * Where: POST auth logout-all-devices route.
 */
export const logoutAllDevices = async (_req: Request, res: Response, _next: NextFunction) => {
  try {
    const auth = res.locals.auth as { id: number } | undefined;

    if (!auth) {
      return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Unauthorized" });
    }

    const result = await logoutAllDevicesService.logoutAllDevices(auth.id);

    // cookie cleanup is an HTTP concern — stays in the controller
    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);

    return res.status(HttpStatusCodes.OK).json({ message: result.message });
  } catch (error) {
    console.error("Logout all devices error:", error);
    return res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Failed to logout from all devices" });
  }
};
