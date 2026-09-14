// Execute the actual Deno handlers under Node with isolated database/provider adapters.
// These tests exercise application logic; they do not verify deployed RLS or PayMongo.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto, createHmac } = require('node:crypto');
const root = path.resolve(__dirname, '../../supabase/functions');

function fixture(options = {}) {
  const db = {
    reservations: [{ id: 'reservation-test', user_id: 'user-test', spot_id: 'spot-test', spot_name: 'Isolated test cafe',
      reservation_fee: 150, fee: 150, payment_required: true, reservation_type: 'paid', payment_status: 'pending',
      status: 'pending_payment', reservation_date: '2030-01-01', reservation_time: '12:00', guest_count: 2,
      ...options.reservation }],
    spots: [{ id: 'spot-test', reservation_fee: 150, gcash_amount: 150, ...options.spot }],
    reservation_payments: structuredClone(options.payments || []),
  };
  const calls = [];
  const writes = [];
  let sequence = 0;
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.mode = 'select'; this.limitCount = Infinity; }
    select() { return this; }
    eq(key, value) { this.filters.push((row) => row[key] === value); return this; }
    neq(key, value) { this.filters.push((row) => row[key] != null && row[key] !== value); return this; }
    order(key, { ascending = true } = {}) { this.sort = { key, ascending }; return this; }
    limit(count) { this.limitCount = count; return this; }
    update(value) { this.mode = 'update'; this.value = value; return this; }
    upsert(value, { onConflict }) { this.mode = 'upsert'; this.value = value; this.conflict = onConflict; return this; }
    async maybeSingle() { const result = await this.execute(); return { ...result, data: result.data?.[0] || null }; }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
    async execute() {
      if (options.failWrite === this.table && this.mode !== 'select') return { data: null, error: { message: 'Injected database write failure' } };
      const all = db[this.table];
      if (!all) throw Error('Unimplemented fixture table: ' + this.table);
      let rows = all.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.mode === 'update') {
        for (const row of rows) Object.assign(row, structuredClone(this.value));
        writes.push({ table: this.table, mode: this.mode, count: rows.length });
      } else if (this.mode === 'upsert') {
        const clean = Object.fromEntries(Object.entries(this.value).filter(([, value]) => value !== undefined));
        let row = all.find((item) => item[this.conflict] === clean[this.conflict]);
        if (row) Object.assign(row, structuredClone(clean));
        else { row = { id: 'payment-' + (++sequence), created_at: new Date().toISOString(), ...structuredClone(clean) }; all.push(row); }
        rows = [row];
        writes.push({ table: this.table, mode: this.mode, count: 1 });
      }
      if (this.sort) rows.sort((a, b) => String(a[this.sort.key]).localeCompare(String(b[this.sort.key])) * (this.sort.ascending ? 1 : -1));
      return { data: structuredClone(rows.slice(0, this.limitCount)), error: null };
    }
  }
  const client = {
    auth: { getUser: async (token) => ({ data: { user: token === 'valid-test-user' ? { id: 'user-test' } : null }, error: null }) },
    from: (table) => new Query(table),
  };
  const env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
    PAYMONGO_SECRET_KEY: 'sk_test_fixture', PAYMONGO_WEBHOOK_SECRET: 'fixture-webhook-secret' };
  const cache = new Map();
  const handlers = new Map();
  function load(file) {
    const absolute = path.resolve(root, file);
    if (cache.has(absolute)) return cache.get(absolute);
    const exports = {};
    cache.set(absolute, exports);
    const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: absolute,
    }).outputText;
    const context = {
      exports, Request, Response, Headers, TextEncoder, TextDecoder, URL, Date, crypto: webcrypto, btoa,
      console: { error() {}, warn() {}, log() {} },
      Deno: { env: { get: (name) => env[name] }, serve: (handler) => handlers.set(file, handler) },
      require: (name) => name.startsWith('https://esm.sh/')
        ? { createClient: () => client }
        : load(path.relative(root, path.resolve(path.dirname(absolute), name))),
      fetch: async (url, init) => {
        calls.push({ url, ...init, payload: JSON.parse(init.body) });
        if (options.providerFailure) return Response.json({ errors: [{ detail: 'Injected provider failure' }] }, { status: 503 });
        const id = 'cs_test_' + (++sequence);
        return Response.json({ data: { id, attributes: { checkout_url: 'https://checkout.paymongo.com/' + id, livemode: false } } });
      },
    };
    vm.runInNewContext(code, context, { filename: absolute });
    return exports;
  }
  async function invoke(name, body = {}, { token = 'valid-test-user', headers = {}, method = 'POST' } = {}) {
    const file = name + '/index.ts';
    load(file);
    return handlers.get(file)(new Request('https://fixture.invalid/' + name, {
      method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json', ...headers },
      ...(method !== 'GET' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    }));
  }
  function event(type = 'checkout_session.payment.paid', sessionId = 'cs_test_existing', attrs = {}) {
    return { data: { id: 'evt_fixture', attributes: { type, livemode: false,
      data: { id: sessionId, type: 'checkout_session', attributes: { amount: 15000, currency: 'PHP', ...attrs } } } } };
  }
  async function webhook(payload, { timestamp = Math.floor(Date.now() / 1000), secret = env.PAYMONGO_WEBHOOK_SECRET } = {}) {
    const raw = JSON.stringify(payload);
    const signature = createHmac('sha256', secret).update(timestamp + '.' + raw).digest('hex');
    return invoke('paymongo-webhook', raw, { token: '', headers: { 'paymongo-signature': `t=${timestamp},te=${signature}` } });
  }
  return { db, calls, writes, invoke, webhook, event };
}

const pendingPayment = {
  id: 'payment-existing', reservation_id: 'reservation-test', user_id: 'user-test', spot_id: 'spot-test',
  provider: 'paymongo', payment_method: 'gcash', provider_checkout_session_id: 'cs_test_existing',
  checkout_url: 'https://checkout.paymongo.com/cs_test_existing', amount: 150, currency: 'PHP', status: 'pending',
  created_at: '2026-01-01T00:00:00Z',
};
module.exports = { fixture, pendingPayment };
