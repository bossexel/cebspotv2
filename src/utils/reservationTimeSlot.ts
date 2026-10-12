import type { TableSlotId } from './tableInventory';

/** Keep existing inventory/locking keys while storing the exact arrival time.
 * These keys do not set a departure time or a length of stay.
 */
export function getReservationTimeSlot(time: string, clubFloorPlan: boolean): TableSlotId {
  const [hour, minute] = time.split(':').map(Number);
  const minutes = hour * 60 + minute;
  if (clubFloorPlan) {
    if (minutes >= 23 * 60 || minutes < 2 * 60) return 'prime';
    if (minutes >= 20 * 60) return 'sunset';
    return 'late';
  }
  if (minutes >= 20 * 60 && minutes < 23 * 60) return 'prime';
  if (minutes >= 17 * 60 && minutes < 20 * 60) return 'sunset';
  return 'late';
}
