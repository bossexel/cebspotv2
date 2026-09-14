import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = { ...process.env };
for (const file of ['.env.local', '.env.test.local']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('BLOCKED: Supabase public URL and anon key are not configured.');
  process.exit(2);
}

const spotId = '66666666-6666-4666-8666-666666666666';
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
});

const result = {
  spot: { reachable: false, name: null, category: null, inventoryCounts: null },
  availabilityRpc: { installed: false, reservedCount: null },
};

const spotResponse = await client
  .from('spots')
  .select('id,name,category,table_inventory')
  .eq('id', spotId)
  .maybeSingle();

if (spotResponse.error) {
  result.spot.error = spotResponse.error.message;
} else if (spotResponse.data) {
  const inventory = spotResponse.data.table_inventory;
  result.spot = {
    reachable: true,
    name: spotResponse.data.name,
    category: spotResponse.data.category,
    inventoryCounts: inventory && typeof inventory === 'object'
      ? Object.fromEntries(['sunset', 'prime', 'late'].map((slotId) => [
          slotId,
          Array.isArray(inventory[slotId]) ? inventory[slotId].length : 0,
        ]))
      : null,
  };
}

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const rpcResponse = await client.rpc('get_reserved_table_ids', {
  target_spot_id: spotId,
  target_reservation_date: today,
  target_slot_id: 'sunset',
});

if (rpcResponse.error) {
  result.availabilityRpc.error = rpcResponse.error.message;
} else {
  result.availabilityRpc = {
    installed: true,
    reservedCount: Array.isArray(rpcResponse.data) ? rpcResponse.data.length : 0,
  };
}

console.log(JSON.stringify(result, null, 2));

const inventoryReady = result.spot.inventoryCounts
  && Object.values(result.spot.inventoryCounts).every((count) => count === 62);
if (!result.spot.reachable || result.spot.name !== 'Test Cebspot Club' || !inventoryReady || !result.availabilityRpc.installed) {
  process.exitCode = 1;
}
