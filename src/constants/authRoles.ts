export type AppRole = 'admin' | 'owner' | 'user';

export const ADMIN_EMAIL = 'testadmin@cebspot.com';
export const OWNER_EMAIL = 'testowner@cebspot.com';
export const USER_EMAIL = 'exielramen@gmail.com';

type RoleProfile = {
  email?: string | null;
  role?: AppRole | string | null;
};

export function normalizeAuthEmail(email?: string | null) {
  return (email ?? '').trim().toLowerCase();
}

export function getPrototypeRoleForEmail(email?: string | null): AppRole {
  const normalizedEmail = normalizeAuthEmail(email);
  if (normalizedEmail === ADMIN_EMAIL) return 'admin';
  if (normalizedEmail === OWNER_EMAIL) return 'owner';
  return 'user';
}

export function hasAdminAccess(profile?: RoleProfile | null) {
  return profile?.role === 'admin' && normalizeAuthEmail(profile.email) === ADMIN_EMAIL;
}

export function hasOwnerAccess(profile?: RoleProfile | null) {
  return profile?.role === 'owner' && normalizeAuthEmail(profile.email) === OWNER_EMAIL;
}
