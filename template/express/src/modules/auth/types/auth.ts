export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  remember?: boolean;
};

export type LoginInput = {
  email: string;
  password: string;
  remember?: boolean;
};

export type ForgotPasswordInput = {
  email: string;
};

export type ResetPasswordInput = {
  email: string;
  token: string;
  password: string;
};

export type VerifyEmailInput = {
  email: string;
  token: string;
};

export type RefreshTokenInput = {
  refresh_token: string;
};
