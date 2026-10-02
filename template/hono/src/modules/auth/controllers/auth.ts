import type { Handler } from "hono";
import { cookie, HttpStatusCodes } from "@/framework/facade.js";
import { forgotPasswordService } from "@/modules/auth/services/forgetpassword.js";
import { loginService } from "@/modules/auth/services/login.js";
import { logoutService } from "@/modules/auth/services/logout.js";
import { meService } from "@/modules/auth/services/me.js";
import { registerService } from "@/modules/auth/services/register.js";
import { resetPasswordService } from "@/modules/auth/services/resetpassword.js";
import {
  ForgotPasswordInput,
  LoginInput,
  RefreshTokenInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput
} from "@/modules/auth/types/auth.js";
import { logoutAllDevicesService } from "../services/logoutalldevices.js";
import { refreshTokenService } from "../services/refreshtoken.js";
import { verifyEmailService } from "../services/verifyemail.js";

/**
 * Why: Creates a new user, issues tokens, and triggers signup side effects.
 * When: Used on first-time account creation.
 * Where: POST auth register route.
 */
export const register: Handler = async (c: any) => {
  try {
    const body = c.req.valid("json") as RegisterInput;
    const result = await registerService.register(c, body);

    switch (result.kind) {
      case "email_exists":
        return c.json({ message: result.message }, HttpStatusCodes.UNPROCESSABLE_ENTITY);

      case "verification_required":
        return c.json({ message: result.message }, HttpStatusCodes.CREATED);

      case "registered":
        return c.json({ message: result.message, data: result.data }, HttpStatusCodes.CREATED);
    }
  } catch (error) {
    console.error("Register error:", error);
    return c.json({ message: "Failed to register user" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Why: Authenticates user credentials and rotates active login cookies/tokens.
 * When: Used whenever a user signs in.
 * Where: POST auth login route.
 */
export const login: Handler = async (c: any) => {
  try {
    const body = c.req.valid("json") as LoginInput;
    const result = await loginService.login(c, body);

    switch (result.kind) {
      case "invalid_credentials":
        return c.json({ message: result.message }, HttpStatusCodes.UNAUTHORIZED);

      case "email_not_verified":
        return c.json({ message: result.message }, HttpStatusCodes.FORBIDDEN);

      case "logged_in":
        return c.json({ message: result.message, data: result.data }, HttpStatusCodes.OK);
    }
  } catch (error) {
    console.error("Login error:", error);
    return c.json({ message: "Failed to login" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Why: Returns the currently authenticated user profile.
 * When: Used by clients to bootstrap session/user state.
 * Where: GET auth me route.
 */
export const me: Handler = async (c: any) => {
  try {
    const auth = c.get("auth");
    const result = await meService.me(auth.id);

    switch (result.kind) {
      case "not_found":
        return c.json({ message: result.message }, HttpStatusCodes.NOT_FOUND);

      case "found":
        return c.json({ message: result.message, data: result.data }, HttpStatusCodes.OK);
    }
  } catch (error) {
    console.error("Me error:", error);
    return c.json({ message: "Failed to fetch user" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Why: Revokes current refresh token and clears auth cookies.
 * When: Used when the active device logs out.
 * Where: POST auth logout route.
 */
export const logout: Handler = async (c: any) => {
  try {
    const result = await logoutService.logout(c);

    return c.json({ message: result.message }, HttpStatusCodes.OK);
  } catch (error) {
    console.error("Logout error:", error);

    // always clear cookies, even if revocation failed
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);

    return c.json({ message: "Failed to logout" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Why: Starts password reset flow and queues email delivery event.
 * When: Used when user requests a forgot-password link.
 * Where: POST auth forgot-password route.
 */
export const forgotPassword: Handler = async (c: any) => {
  try {
    const body = c.req.valid("json") as ForgotPasswordInput;
    const result = await forgotPasswordService.forgotPassword(body);

    // Single success path — intentionally identical whether or not the email exists.
    return c.json({ message: result.message }, HttpStatusCodes.OK);
  } catch (error) {
    console.error("Forgot password error:", error);
    return c.json({ message: "Failed to process forgot password request" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Why: Verifies reset token and persists the new password.
 * When: Used after user submits reset token + new password.
 * Where: POST auth reset-password route.
 */
export const resetPassword: Handler = async (c: any) => {
  try {
    const body = c.req.valid("json") as ResetPasswordInput;
    const result = await resetPasswordService.resetPassword(body);

    switch (result.kind) {
      case "invalid_token":
        return c.json({ message: result.message }, HttpStatusCodes.UNPROCESSABLE_ENTITY);

      case "reset":
        return c.json({ message: result.message }, HttpStatusCodes.OK);
    }
  } catch (error) {
    console.error("Reset password error:", error);
    return c.json({ message: "Failed to reset password" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Why: Validates email verification token and marks user as verified.
 * When: Used when user opens verification link from inbox.
 * Where: POST auth verify-email route.
 */
export const verifyEmail: Handler = async (c: any) => {
  try {
    const body = c.req.valid("json") as VerifyEmailInput;
    const result = await verifyEmailService.verifyEmail(body);

    switch (result.kind) {
      case "not_required":
        return c.json({ message: result.message }, HttpStatusCodes.OK);

      case "invalid_token":
        return c.json({ message: result.message }, HttpStatusCodes.UNPROCESSABLE_ENTITY);

      case "verified":
        return c.json({ message: result.message }, HttpStatusCodes.OK);
    }
  } catch (error) {
    console.error("Verify email error:", error);
    return c.json({ message: "Failed to verify email" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Why: Rotates refresh token and reissues access credentials.
 * When: Used when access token expires but refresh token is still valid.
 * Where: POST auth refresh-token route.
 */
export const refreshToken: Handler = async (c: any) => {
  try {
    const body = c.req.valid("json") as RefreshTokenInput;
    const result = await refreshTokenService.refreshToken(body);

    switch (result.kind) {
      case "invalid_token":
      case "revoked":
      case "expired":
      case "user_not_found":
        return c.json({ message: result.message }, HttpStatusCodes.UNAUTHORIZED);

      case "refreshed": {
        // Cookie handling stays in the controller — it's an HTTP concern.
        await cookie.setAuth(c, result.cookies.accessToken);
        await cookie.setRefresh(c, result.cookies.refreshToken, result.cookies.refreshExpiry);

        return c.json({ message: result.message, data: result.data }, HttpStatusCodes.OK);
      }
    }
  } catch (error) {
    console.error("Refresh token error:", error);
    return c.json({ message: "Invalid or expired refresh token" }, HttpStatusCodes.UNAUTHORIZED);
  }
};

/**
 * Why: Revokes all refresh tokens for account-wide logout.
 * When: Used for "logout from all devices" security action.
 * Where: POST auth logout-all-devices route.
 */
export const logoutAllDevices: Handler = async (c: any) => {
  try {
    const auth = c.get("auth");
    if (!auth) {
      return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const result = await logoutAllDevicesService.logoutAllDevices(auth.id);

    // Cookies are an HTTP concern — kept out of the service.
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);

    return c.json({ message: result.message }, HttpStatusCodes.OK);
  } catch (error) {
    console.error("Logout all devices error:", error);
    return c.json({ message: "Failed to logout from all devices" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
