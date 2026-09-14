import type { TableInventory, TableInventoryItem, TableSlotId } from '../utils/tableInventory';

export const testCebspotClubSpotId = '66666666-6666-4666-8666-666666666666';

export type ClubTableKind = 'cocktail' | 'vvip-main' | 'vip-main' | 'vip-mezzanine' | 'owner-vip';

export type ClubFloorTable = {
  tableId: string;
  label: string;
  capacity: number;
  kind: ClubTableKind;
  x: number;
  y: number;
  width: number;
  height: number;
  bookable: boolean;
};

export const clubTableColors: Record<ClubTableKind, string> = {
  cocktail: '#EC1671',
  'vvip-main': '#F8EA3B',
  'vip-main': '#F15A2A',
  'vip-mezzanine': '#86C51F',
  'owner-vip': '#20AD78',
};

function cocktailTables(): ClubFloorTable[] {
  const rows = [
    [1, 5, 9, 13, 17],
    [2, 6, 10, 14, 18],
    [3, 7, 11, 15, 19],
    [4, 8, 12, 16, 20],
  ];
  const left = rows.flatMap((row, rowIndex) =>
    row.map((number, columnIndex) => ({
      tableId: `C${String(number).padStart(2, '0')}`,
      label: String(number),
      capacity: 4,
      kind: 'cocktail' as const,
      x: 78 + columnIndex * 45,
      y: 128 + rowIndex * 38,
      width: 36,
      height: 28,
      bookable: true,
    })),
  );

  const middleRows = [
    [21, 23, 25, 27, 29],
    [22, 24, 26, 28, 30],
  ];
  const middle = middleRows.flatMap((row, rowIndex) =>
    row.map((number, columnIndex) => ({
      tableId: `C${String(number).padStart(2, '0')}`,
      label: String(number),
      capacity: 4,
      kind: 'cocktail' as const,
      x: 292 + columnIndex * 36,
      y: 185 + rowIndex * 38,
      width: 32,
      height: 28,
      bookable: true,
    })),
  );

  const rightRows = [
    [31, 34, 37, 40],
    [32, 35, 38, 41],
    [33, 36, 39, 42],
  ];
  const right = rightRows.flatMap((row, rowIndex) =>
    row.map((number, columnIndex) => ({
      tableId: `C${String(number).padStart(2, '0')}`,
      label: String(number),
      capacity: 4,
      kind: 'cocktail' as const,
      x: 464 + columnIndex * 34,
      y: 128 + rowIndex * 43,
      width: 31,
      height: 30,
      bookable: true,
    })),
  );

  return [...left, ...middle, ...right];
}

const mainFloorVvip: ClubFloorTable[] = [1, 2, 3, 4].map((number, index) => ({
  tableId: `VVIP${String(number).padStart(2, '0')}`,
  label: `VVIP ${number}`,
  capacity: 10,
  kind: 'vvip-main',
  x: index < 2 ? 145 + index * 82 : 430 + (index - 2) * 82,
  y: 52,
  width: 70,
  height: 42,
  bookable: true,
}));

const mainFloorVip: ClubFloorTable[] = [9, 8, 7, 6, 5].map((number, index) => ({
  tableId: `VIP${String(number).padStart(2, '0')}`,
  label: `VIP ${number}`,
  capacity: 10,
  kind: 'vip-main',
  x: 230 + index * 82,
  y: 274,
  width: 70,
  height: 42,
  bookable: true,
}));

const mezzanineVipPositions = [
  [20, 92, 405], [19, 92, 470], [18, 92, 535],
  [10, 568, 420], [11, 568, 490],
  [17, 145, 615], [16, 225, 615], [15, 305, 615],
  [14, 385, 615], [13, 465, 615], [12, 545, 615],
] as const;

const mezzanineVip: ClubFloorTable[] = mezzanineVipPositions.map(([number, x, y]) => ({
  tableId: `VIP${String(number).padStart(2, '0')}`,
  label: `VIP ${number}`,
  capacity: 10,
  kind: 'vip-mezzanine',
  x,
  y,
  width: 66,
  height: 42,
  bookable: true,
}));

const ownerVip: ClubFloorTable[] = [
  {
    tableId: 'OWNER-VIP-01', label: 'Owner 1', capacity: 10, kind: 'owner-vip',
    x: 218, y: 535, width: 78, height: 42, bookable: false,
  },
  {
    tableId: 'OWNER-VIP-02', label: 'Owner 2', capacity: 10, kind: 'owner-vip',
    x: 468, y: 535, width: 78, height: 42, bookable: false,
  },
];

export const clubFloorTables: ClubFloorTable[] = [
  ...cocktailTables(),
  ...mainFloorVvip,
  ...mainFloorVip,
  ...mezzanineVip,
  ...ownerVip,
];

export const clubBookableTables = clubFloorTables.filter((table) => table.bookable);

function cloneClubTables(): TableInventoryItem[] {
  return clubBookableTables.map((table) => ({
    tableId: table.tableId,
    capacity: table.capacity,
    isReserved: false,
  }));
}

export const defaultClubTableInventory: TableInventory = {
  sunset: cloneClubTables(),
  prime: cloneClubTables(),
  late: cloneClubTables(),
};

export function normalizeClubTableInventory(source: unknown): TableInventory {
  const record = source && typeof source === 'object'
    ? source as Partial<Record<TableSlotId, unknown>>
    : {};

  return (['sunset', 'prime', 'late'] as TableSlotId[]).reduce((inventory, slotId) => {
    const sourceTables = Array.isArray(record[slotId]) ? record[slotId] as Array<Partial<TableInventoryItem>> : [];
    const sourceById = new Map(
      sourceTables
        .filter((table) => typeof table?.tableId === 'string')
        .map((table) => [table.tableId as string, table]),
    );
    inventory[slotId] = clubBookableTables.map((table) => {
      const saved = sourceById.get(table.tableId);
      return {
        tableId: table.tableId,
        capacity: Math.max(1, Number(saved?.capacity) || table.capacity),
        isReserved: Boolean(saved?.isReserved),
      };
    });
    return inventory;
  }, {} as TableInventory);
}

export function clubTableDisplayName(tableId: string) {
  const table = clubFloorTables.find((item) => item.tableId === tableId);
  if (!table) return tableId;
  if (table.kind === 'cocktail') return `Cocktail Table ${table.label}`;
  return table.label;
}
