import type { Activity } from '../types';
import type { AdminUpdate } from '../services/adminUpdateService';

export function mergeActivityNotifications(activities: Activity[], updates: AdminUpdate[]): Activity[] {
  const announcements: Activity[] = updates.filter(update => update.isPublished).map(update => ({
    id: `admin-update:${update.id}:${update.updatedAt}`,
    user_id: '', user_name: 'CebSpot', type: 'admin_update',
    target_id: update.id, target_name: 'Admin Updates', content: update.message,
    created_at: update.publishedAt ?? update.updatedAt,
  }));
  return [...activities, ...announcements].sort((a, b) =>
    Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id));
}
