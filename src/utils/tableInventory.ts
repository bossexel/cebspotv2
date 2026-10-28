export type TableSlotId = 'sunset' | 'prime' | 'late';
export const reservationClientVenueId = '66666666-6666-4666-8666-666666666666';

export function hasReservationInventoryVerification(spot: {
  reservation_inventory_verified_at?: string | null;
}): boolean {
  return Object.prototype.hasOwnProperty.call(spot, 'reservation_inventory_verified_at');
}

export function isReleaseReservable(spot: {
  id?: string; is_public?: boolean; is_reservable?: boolean;
  reservation_inventory_verified_at?: string | null; table_inventory?: unknown;
}): boolean {
  if (spot.id !== reservationClientVenueId || !spot.is_public || !spot.is_reservable
    || !spot.reservation_inventory_verified_at) return false;
  const inventory = normalizeStoredTableInventory(spot.table_inventory);
  return Object.values(inventory).some(tables => tables.some(table => !table.isReserved && table.bookingPolicy !== 'walk_in_only'));
}
export type TableBookingPolicy = 'online_and_walk_ins' | 'walk_in_only';

export const tableBookingPolicyLabels: Record<TableBookingPolicy, string> = {
  online_and_walk_ins: 'Available for online reservations and walk-ins',
  walk_in_only: 'Walk-ins only',
};

export function getTableBookingPolicy(value: unknown): TableBookingPolicy {
  return value === 'walk_in_only' ? 'walk_in_only' : 'online_and_walk_ins';
}

export type TableInventoryItem = {
  tableId: string;
  capacity: number;
  isReserved: boolean;
  bookingPolicy?: TableBookingPolicy;
};

export type TableInventory = Record<TableSlotId, TableInventoryItem[]>;

export const tableSlotLabels: Record<TableSlotId, { label: string; time: string; prefix: string; defaultCapacity: number }> = {
  sunset: { label: 'Sunset', time: '17:00 - 19:30', prefix: 's', defaultCapacity: 2 },
  prime: { label: 'Prime', time: '20:00 - 22:30', prefix: 'p', defaultCapacity: 2 },
  late: { label: 'Late', time: '23:00 - 02:00', prefix: 'l', defaultCapacity: 6 },
};

export const defaultTableInventory: TableInventory = {
  sunset: [
    { tableId: 's1', capacity: 2, isReserved: false },
    { tableId: 's2', capacity: 2, isReserved: false },
    { tableId: 's3', capacity: 4, isReserved: false },
    { tableId: 's4', capacity: 6, isReserved: false },
  ],
  prime: [
    { tableId: 'p1', capacity: 2, isReserved: true },
    { tableId: 'p2', capacity: 2, isReserved: false },
    { tableId: 'p3', capacity: 4, isReserved: true },
  ],
  late: [
    { tableId: 'l1', capacity: 2, isReserved: false },
    { tableId: 'l2', capacity: 6, isReserved: false },
  ],
};

const tableSlotIds: TableSlotId[] = ['sunset', 'prime', 'late'];

export function createEmptyTableInventory(): TableInventory {
  return {
    sunset: [],
    prime: [],
    late: [],
  };
}

function cloneTables(tables: TableInventoryItem[]) {
  return tables.map((table) => ({ ...table }));
}

function normalizeTables(value: unknown, fallback: TableInventoryItem[]) {
  if (!Array.isArray(value)) return cloneTables(fallback);

  const tables = value
    .map((table, index) => {
      if (!table || typeof table !== 'object') return null;
      const record = table as Partial<TableInventoryItem>;
      const capacity = Math.max(1, Number(record.capacity) || 1);
      const tableId = typeof record.tableId === 'string' && record.tableId.trim() ? record.tableId.trim() : `t${index + 1}`;

      return {
        tableId,
        capacity,
        isReserved: Boolean(record.isReserved),
        bookingPolicy: getTableBookingPolicy(record.bookingPolicy),
      };
    })
    .filter(Boolean) as TableInventoryItem[];

  return tables.length ? tables : cloneTables(fallback);
}

function normalizeStoredTables(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((table) => {
      if (!table || typeof table !== 'object') return null;
      const record = table as Partial<TableInventoryItem>;
      const tableId = typeof record.tableId === 'string' ? record.tableId.trim() : '';
      const capacity = Number(record.capacity);
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(tableId) || !Number.isInteger(capacity) || capacity < 1 || capacity > 100) return null;

      return {
        tableId,
        capacity,
        isReserved: Boolean(record.isReserved),
        bookingPolicy: getTableBookingPolicy(record.bookingPolicy),
      };
    })
    .filter(Boolean) as TableInventoryItem[];
}

/**
 * Reads only the inventory stored for a venue. Unlike normalizeTableInventory,
 * this never inserts demo tables when a venue has not configured any.
 */
export function normalizeStoredTableInventory(source: unknown): TableInventory {
  const record = source && typeof source === 'object'
    ? (source as Partial<Record<TableSlotId, unknown>>)
    : {};

  return {
    sunset: normalizeStoredTables(record.sunset),
    prime: normalizeStoredTables(record.prime),
    late: normalizeStoredTables(record.late),
  };
}

/** Physical tables are shared across all adjustable reservation times. */
export function getPhysicalTables(source: unknown): TableInventoryItem[] {
  const inventory = normalizeStoredTableInventory(source);
  const tables = new Map<string, TableInventoryItem>();
  for (const slotId of tableSlotIds) {
    for (const table of inventory[slotId]) {
      const previous = tables.get(table.tableId);
      tables.set(table.tableId, {
        ...table,
        capacity: previous ? Math.min(previous.capacity, table.capacity) : table.capacity,
        isReserved: table.isReserved || Boolean(previous?.isReserved),
        bookingPolicy: table.bookingPolicy === 'walk_in_only' || previous?.bookingPolicy === 'walk_in_only'
          ? 'walk_in_only' : 'online_and_walk_ins',
      });
    }
  }
  return [...tables.values()];
}

export function updatePhysicalTable(
  source: TableInventory, tableId: string, updates: Partial<Pick<TableInventoryItem, 'capacity' | 'isReserved' | 'bookingPolicy'>>,
): TableInventory {
  const inventory = normalizeStoredTableInventory(source);
  for (const slotId of tableSlotIds) {
    inventory[slotId] = inventory[slotId].map((table) => table.tableId === tableId ? {
      ...table,
      ...updates,
      capacity: updates.capacity === undefined ? table.capacity : Math.max(1, Math.min(100, Math.floor(updates.capacity))),
    } : table);
  }
  return inventory;
}

/** Refresh saved policy without discarding capacity/service edits in progress. */
export function mergeTableInventoryDraft(current: TableInventory, previous: TableInventory, saved: TableInventory): TableInventory {
  const result = createEmptyTableInventory();
  for (const slotId of tableSlotIds) {
    const beforeById = new Map(previous[slotId].map(table => [table.tableId, table]));
    const draftById = new Map(current[slotId].map(table => [table.tableId, table]));
    const savedIds = new Set(saved[slotId].map(table => table.tableId));
    result[slotId] = saved[slotId].map(table => {
      const before = beforeById.get(table.tableId);
      const draft = draftById.get(table.tableId);
      if (!before || !draft) return { ...table };
      return {
        ...table,
        capacity: draft.capacity !== before.capacity ? draft.capacity : table.capacity,
        isReserved: draft.isReserved !== before.isReserved ? draft.isReserved : table.isReserved,
      };
    });
    // Newly added, unpublished tables remain in the draft. A table removed on
    // the server is never resurrected by an old draft.
    result[slotId].push(...current[slotId].filter(table => !beforeById.has(table.tableId) && !savedIds.has(table.tableId)).map(table => ({ ...table })));
  }
  return result;
}

export function addPhysicalTable(source: TableInventory): TableInventory {
  const inventory = normalizeStoredTableInventory(source);
  const ids = new Set(getPhysicalTables(inventory).map((table) => table.tableId));
  let number = 1;
  while (ids.has(`T${String(number).padStart(2, '0')}`)) number += 1;
  const table = { tableId: `T${String(number).padStart(2, '0')}`, capacity: 2, isReserved: false };
  for (const slotId of tableSlotIds) inventory[slotId].push({ ...table });
  return inventory;
}

export function normalizeTableInventory(source: unknown): TableInventory {
  const record = source && typeof source === 'object' ? (source as Partial<Record<TableSlotId, unknown>>) : {};

  return {
    sunset: normalizeTables(record.sunset, defaultTableInventory.sunset),
    prime: normalizeTables(record.prime, defaultTableInventory.prime),
    late: normalizeTables(record.late, defaultTableInventory.late),
  };
}

export function addTableToInventory(inventory: TableInventory, slotId: TableSlotId): TableInventory {
  const next = normalizeTableInventory(inventory);
  const slot = tableSlotLabels[slotId];
  const nextNumber = next[slotId].length + 1;

  next[slotId] = [
    ...next[slotId],
    {
      tableId: `${slot.prefix}${nextNumber}`,
      capacity: slot.defaultCapacity,
      isReserved: false,
    },
  ];

  return next;
}

export function removeTableFromInventory(inventory: TableInventory, slotId: TableSlotId): TableInventory {
  const next = normalizeTableInventory(inventory);
  if (next[slotId].length <= 1) return next;
  next[slotId] = next[slotId].slice(0, -1);
  return next;
}

export function getTableInventoryTotals(inventory: TableInventory) {
  return tableSlotIds.map((slotId) => {
    const tables = inventory[slotId];
    return {
      slotId,
      ...tableSlotLabels[slotId],
      tableCount: tables.length,
      openCount: tables.filter((table) => !table.isReserved).length,
      capacity: tables.reduce((sum, table) => sum + table.capacity, 0),
    };
  });
}
