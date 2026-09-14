export type AppRole = 'admin' | 'owner' | 'user';

export const ADMIN_EMAIL = 'testadmin6000@gmail.com';
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

export function getAppRole(profile?: RoleProfile | null): AppRole {
  if (profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'user') {
    return profile.role;
  }
  return getPrototypeRoleForEmail(profile?.email);
}

export function getRoleHome(role: AppRole): '/admin' | '/owner-dashboard' | '/' {
  if (role === 'admin') return '/admin';
  if (role === 'owner') return '/owner-dashboard';
  return '/';
}

export function canAccessRootRoute(role: AppRole, rootRoute: string) {
  if (rootRoute === 'auth' || rootRoute === 'reset-password') return true;
  if (role === 'admin') return rootRoute === 'admin';
  if (role === 'owner') return rootRoute === 'owner-dashboard';
  return rootRoute !== 'admin' && rootRoute !== 'owner-dashboard';
}

export function hasAdminAccess(profile?: RoleProfile | null) {
  return profile?.role === 'admin' && normalizeAuthEmail(profile.email) === ADMIN_EMAIL;
}

export function hasOwnerAccess(profile?: RoleProfile | null) {
  return profile?.role === 'owner';
}
