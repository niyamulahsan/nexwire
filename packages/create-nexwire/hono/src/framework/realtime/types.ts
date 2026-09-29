export type RealtimeAuthContext = {
  isAuthenticated: boolean;
  userId: string | null;
  roles: string[];
  payload: Record<string, unknown> | null;
};
