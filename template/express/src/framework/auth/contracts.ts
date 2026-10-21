export interface AuthProviderUser {
  id: number;
  email?: string | null;
  [key: string]: any;
}

export interface AuthProviderRefreshToken {
  id: number;
  jti: string;
  revoked?: boolean | null;
  expiresAt?: Date | string | null;
  userId?: number | null;
  [key: string]: any;
}

export interface AuthUserContext {
  id: number;
  email?: string | null;
  roleId?: number | null;
  role?: string | null;
  [key: string]: any;
}

export interface AuthProvider {
  getUserById(id: number): Promise<AuthProviderUser | null>;
  findRefreshToken(jti: string): Promise<AuthProviderRefreshToken | null>;
  revokeRefreshToken?(tokenId: number): Promise<void>;
  deleteRefreshToken?(tokenId: number): Promise<void>;
  getAuthContext?(user: AuthProviderUser, payload?: any): Promise<AuthUserContext | any>;
  getUserContact?(userId: number): Promise<{ email?: string | null; name?: string | null; phone?: string | null } | null>;
}
