export type TableSlotId = 'sunset' | 'prime' | 'late';

export type TableInventoryItem = {
  tableId: string;
  capacity: number;
  isReserved: boolean;
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
      };
    })
    .filter(Boolean) as TableInventoryItem[];

  return tables.length ? tables : cloneTables(fallback);
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
