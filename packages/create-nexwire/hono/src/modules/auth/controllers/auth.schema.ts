import { z } from "@/framework/facade.js";

export const MessageSchema = z.object({
  message: z.string()
});

export const RoleSchema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional()
});

export const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.email(),
  roleId: z.number().nullable().optional(),
  role: RoleSchema.nullable().optional(),
  emailVerifiedAt: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional()
});

export const RegisterSchema = z
  .object({
    name: z.string().min(2).max(100),
    email: z.email(),
    password: z
      .string()
      .min(6)
      .max(100)
      .regex(/[a-z]/, "Password must contain lowercase letter")
      .regex(/[A-Z]/, "Password must contain uppercase letter")
      .regex(/[^A-Za-z0-9]/, "Password must contain special character"),
    password_confirmation: z.string()
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.password_confirmation) {
      ctx.addIssue({
        code: "custom",
        path: ["password_confirmation"],
        message: "Password confirmation does not match"
      });
    }
  });

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  remember: z.boolean().optional().default(false)
});

export const ForgotPasswordSchema = z.object({
  email: z.email()
});

export const ResetPasswordSchema = z
  .object({
    email: z.email(),
    token: z.string().min(1),
    password: z
      .string()
      .min(6)
      .max(100)
      .regex(/[a-z]/, "Password must contain lowercase letter")
      .regex(/[A-Z]/, "Password must contain uppercase letter")
      .regex(/[^A-Za-z0-9]/, "Password must contain special character"),
    password_confirmation: z.string()
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.password_confirmation) {
      ctx.addIssue({
        code: "custom",
        path: ["password_confirmation"],
        message: "Password confirmation does not match"
      });
    }
  });

export const RefreshTokenSchema = z.object({
  refresh_token: z.string().min(1)
});

export const VerifyEmailSchema = z.object({
  email: z.email(),
  token: z.string().min(1)
});

export const AuthResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    user: UserSchema,
    access_token: z.string(),
    refresh_token: z.string(),
    token_type: z.literal("Bearer")
  })
});

export const IdParamsSchema = z.object({
  id: z.coerce.number()
});
