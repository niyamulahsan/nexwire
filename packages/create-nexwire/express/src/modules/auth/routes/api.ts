import { createRoute, createRouter, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
import { loginLimiter } from "@/framework/http/ratelimiter.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import {
  forgotPassword,
  login,
  logout,
  logoutAllDevices,
  me,
  refreshToken,
  register,
  resetPassword,
  verifyEmail
} from "@/modules/auth/controllers/auth.controller.js";
import {
  AuthResponseSchema,
  ForgotPasswordSchema,
  LoginSchema,
  MessageSchema,
  RefreshTokenSchema,
  RegisterSchema,
  ResetPasswordSchema,
  UserSchema,
  VerifyEmailSchema
} from "@/modules/auth/controllers/auth.schema.js";

const registerRoute = createRoute({
  path: "/register",
  method: "post",
  tags: ["Auth"],
  description: "Register a new user",
  request: {
    body: jsonContent(RegisterSchema, "Register payload")
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(AuthResponseSchema, "Registered")
  }
});

const loginRoute = createRoute({
  path: "/login",
  method: "post",
  tags: ["Auth"],
  description: "Login user",
  request: {
    body: jsonContent(LoginSchema, "Login payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(AuthResponseSchema, "Logged in")
  }
});

const meRoute = createRoute({
  path: "/me",
  method: "get",
  tags: ["Auth"],
  description: "Get authenticated user",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: UserSchema }), "Authenticated user")
  }
});

const logoutRoute = createRoute({
  path: "/logout",
  method: "post",
  tags: ["Auth"],
  description: "Logout user from current device",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(MessageSchema, "Logged out")
  }
});

const logoutAllDevicesRoute = createRoute({
  path: "/logout-all",
  method: "post",
  tags: ["Auth"],
  description: "Logout user from all devices",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(MessageSchema, "Logged out from all devices")
  }
});

const forgotPasswordRoute = createRoute({
  path: "/forgot-password",
  method: "post",
  tags: ["Auth"],
  description: "Send reset password email",
  request: {
    body: jsonContent(ForgotPasswordSchema, "Forgot password payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(MessageSchema, "Reset email sent")
  }
});

const resetPasswordRoute = createRoute({
  path: "/reset-password",
  method: "post",
  tags: ["Auth"],
  description: "Reset password using token",
  request: {
    body: jsonContent(ResetPasswordSchema, "Reset password payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(MessageSchema, "Password reset")
  }
});

const refreshTokenRoute = createRoute({
  path: "/refresh-token",
  method: "post",
  tags: ["Auth"],
  description: "Refresh access token",
  request: {
    body: jsonContent(RefreshTokenSchema, "Refresh token payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(AuthResponseSchema, "Token refreshed")
  }
});

const verifyEmailRoute = createRoute({
  path: "/verify-email",
  method: "post",
  tags: ["Auth"],
  description: "Verify user email using token",
  request: {
    body: jsonContent(VerifyEmailSchema, "Verify email payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(MessageSchema, "Email verified")
  }
});

const publicRoute = createRouter()
  .group(loginLimiter)
  .api(registerRoute, register)
  .api(loginRoute, login)
  .api(forgotPasswordRoute, forgotPassword)
  .api(resetPasswordRoute, resetPassword)
  .api(verifyEmailRoute, verifyEmail)
  .api(refreshTokenRoute, refreshToken);

const protectedRoute = createRouter()
  .group(authMiddleware)
  .api(meRoute, me)
  .api(logoutRoute, logout)
  .api(logoutAllDevicesRoute, logoutAllDevices);

export default createRouter().route("/", publicRoute).route("/", protectedRoute);
