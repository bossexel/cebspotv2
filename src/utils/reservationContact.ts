import type { UserProfile } from '../types';

export function getReservationContact(profile: Pick<UserProfile,'first_name'|'last_name'|'display_name'|'email'> | null | undefined, phone: string) {
  if (!profile) return null;
  const name = [profile.first_name,profile.last_name].filter(Boolean).join(' ').trim() || profile.display_name?.trim() || '';
  const email = profile.email?.trim().toLowerCase() || '';
  const mobile = phone.trim().replace(/[ ()-]/g,'');
  const validEmail = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
  if (name.length < 2 || name.length > 120 || email.length < 5 || email.length > 254 || !validEmail.test(email)
    || !/^(09\d{9}|\+639\d{9})$/.test(mobile)) return null;
  return {guest_name:name,guest_email:email,guest_phone:mobile};
}
