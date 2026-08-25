import { sampleCircles } from '../constants/sampleData';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { Circle, CircleInvite, CircleMember } from '../types';

const localCircles: Circle[] = [...sampleCircles];
const localInvites = new Map<string, CircleInvite>();

function generateLocalInviteCode() {
  const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
  const numbers = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `${letters}-${numbers}`;
}

export const circleService = {
  async getUserCircles(userId: string): Promise<Circle[]> {
    if (!hasSupabaseConfig) return localCircles;

    const { data, error } = await supabase
      .from('circles')
      .select('*')
      .contains('members', [userId]);
    if (error) throw error;
    return (data ?? []) as Circle[];
  },

  async createCircle(name: string, ownerId: string): Promise<Circle> {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('Enter a circle name.');

    if (!hasSupabaseConfig) {
      const createdCircle: Circle = {
        id: `local-circle-${Date.now()}`,
        name: normalizedName,
        owner_id: ownerId,
        members: [ownerId],
        created_at: new Date().toISOString(),
      };
      localCircles.unshift(createdCircle);
      return createdCircle;
    }

    const { data, error } = await supabase
      .from('circles')
      .insert({
        name: normalizedName,
        owner_id: ownerId,
        members: [ownerId],
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as Circle;
  },

  async getCircleById(circleId: string): Promise<Circle | null> {
    if (!hasSupabaseConfig) {
      return localCircles.find((circle) => circle.id === circleId) ?? null;
    }

    const { data, error } = await supabase.from('circles').select('*').eq('id', circleId).maybeSingle();
    if (error) throw error;
    return data as Circle | null;
  },

  async getCircleMembers(circleId: string): Promise<CircleMember[]> {
    if (!hasSupabaseConfig) {
      const circle = localCircles.find((item) => item.id === circleId);
      if (!circle) return [];
      return Array.from(new Set([circle.owner_id, ...circle.members])).map((memberId) => ({
        id: memberId,
        display_name: memberId === circle.owner_id ? 'Circle owner' : 'Circle member',
        photo_url: null,
        location: null,
        last_location_update: null,
        is_owner: memberId === circle.owner_id,
      }));
    }

    const { data, error } = await supabase.rpc('get_circle_members', { target_circle_id: circleId });
    if (error) throw error;
    return (data ?? []) as CircleMember[];
  },

  async getOrCreateInviteCode(circleId: string): Promise<CircleInvite> {
    if (!hasSupabaseConfig) {
      const existing = localInvites.get(circleId);
      if (existing && new Date(existing.expires_at).getTime() > Date.now()) return existing;

      const invite = {
        code: generateLocalInviteCode(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      localInvites.set(circleId, invite);
      return invite;
    }

    const { data, error } = await supabase.rpc('get_or_create_circle_invite_code', {
      target_circle_id: circleId,
    });
    if (error) throw error;
    const invite = (Array.isArray(data) ? data[0] : data) as CircleInvite | null;
    if (!invite) throw new Error('Unable to create an invitation code.');
    return invite;
  },

  async joinCircleByCode(inviteCode: string, userId: string): Promise<Circle> {
    const normalizedCode = inviteCode.trim().toUpperCase();
    if (!/^[A-Z]{3}-\d{3}$/.test(normalizedCode)) {
      throw new Error('Enter a valid invitation code such as ABC-123.');
    }

    if (!hasSupabaseConfig) {
      const match = Array.from(localInvites.entries()).find(
        ([, invite]) => invite.code === normalizedCode && new Date(invite.expires_at).getTime() > Date.now()
      );
      const circle = match ? localCircles.find((item) => item.id === match[0]) : null;
      if (!circle) throw new Error('Invitation code is invalid or expired.');
      if (!circle.members.includes(userId)) circle.members.push(userId);
      return circle;
    }

    const { data, error } = await supabase.rpc('join_circle_by_code', { submitted_code: normalizedCode });
    if (error) throw error;
    const circle = (Array.isArray(data) ? data[0] : data) as Circle | null;
    if (!circle) throw new Error('Unable to join this circle.');
    return circle;
  },
};
