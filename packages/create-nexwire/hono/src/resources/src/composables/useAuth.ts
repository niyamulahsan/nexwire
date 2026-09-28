import { computed, type Ref, readonly, ref } from "vue";

type UnknownRecord = Record<string, unknown>;

export type RoleLike = {
  id?: string | number;
  name?: string;
  title?: string;
  slug?: string;
} & UnknownRecord;

export type AuthUser = UnknownRecord & {
  id?: string | number;
  name?: string;
  role?: RoleLike | null;
  roles?: RoleLike[] | null;
};

const userRef: Ref<AuthUser | null> = ref(null);

export function setUser(user: AuthUser | null) {
  userRef.value = user;
}

export function clearUser() {
  userRef.value = null;
}

export function useAuth() {
  return {
    user: readonly(userRef),
    isAuthenticated: computed(() => !!userRef.value),
    setUser,
    clearUser
  };
}

export const authUser = computed<AuthUser>(() => userRef.value ?? {});

export function hasRole(...wanted: string[]): boolean {
  const subject = userRef.value;
  if (!subject) return false;

  const current = (subject.roles ?? (subject.role ? [subject.role] : []))
    .map((item) => (item.name || item.title || item.slug || "").toLowerCase().trim())
    .filter(Boolean);

  if (!wanted.length) return current.length > 0;

  const expected = wanted.map((item) => item.toLowerCase().trim()).filter(Boolean);
  return current.some((item) => expected.includes(item));
}
