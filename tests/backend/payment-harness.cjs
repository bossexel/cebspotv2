// Execute the actual Deno handlers under Node with isolated database/provider adapters.
// These tests exercise application logic; they do not verify deployed RLS or PayMongo.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto, createHmac } = require('node:crypto');
const root = path.resolve(__dirname, '../../supabase/functions');

function fixture(options = {}) {
  const firstPayment = options.payments?.[0];
  const db = {
    reservations: [{ id: firstPayment?.reservation_id ?? 'reservation-test', user_id: firstPayment?.user_id ?? 'user-test',
      spot_id: firstPayment?.spot_id ?? 'spot-test', spot_name: 'Isolated test cafe',
      reservation_fee: 150, fee: 150, payment_required: true, reservation_type: 'paid', payment_status: 'pending',
      status: 'pending_payment', reservation_date: '2030-01-01', reservation_time: '12:00', guest_count: 2,
      guest_name: 'Booking Guest', guest_email: 'guest@example.test', guest_phone: '09171234567',
      ...options.reservation }],
    spots: [{ id: firstPayment?.spot_id ?? 'spot-test', reservation_fee: 150, gcash_amount: 150, ...options.spot }],
    reservation_payments: structuredClone(options.payments || []),
  };
  const calls = [];
  const rpcCalls = [];
  const writes = [];
  let sequence = 0;
  const idempotentProviderResponses = new Map();
  const providerSessions = new Map();
  const webhookEvents = new Map();
  for (const payment of db.reservation_payments) {
    if (!payment.provider_checkout_session_id) continue;
    providerSessions.set(payment.provider_checkout_session_id, {
      id: payment.provider_checkout_session_id,
      type: 'checkout_session',
      attributes: {
        checkout_url: payment.checkout_url,
        livemode: false,
        status: 'active',
        metadata: { checkout_attempt_id: payment.id, reservation_id: payment.reservation_id },
        line_items: [{ amount: Number(payment.amount) * 100, currency: payment.currency, quantity: 1 }],
        payments: [{ id: 'pay_fixture_existing', type: 'payment', attributes: {
          amount: Number(payment.amount) * 100, currency: payment.currency, status: 'paid', livemode: false,
          payment_intent_id: 'pi_fixture_existing',
        } }],
      },
    });
  }
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
    async rpc(name, args = {}) {
      rpcCalls.push(name);
      if (name === 'ingest_paymongo_event') {
        const prior = webhookEvents.get(args.incoming_event_id);
        if (prior && prior.payload_hash !== args.payload_hash) return { data: null, error: { code: '22023' } };
        const event = prior ?? { ...args, session_id: args.incoming_session_id,
          payload_hash: args.payload_hash, state: 'pending', result: null };
        webhookEvents.set(args.incoming_event_id, event);
        return { data: structuredClone(event), error: null };
      }
      if (name === 'apply_paymongo_snapshot') {
        const event = webhookEvents.get(args.incoming_event_id);
        const payment = db.reservation_payments.find(row => row.id === args.target_attempt_id);
        const reservation = payment && db.reservations.find(row => row.id === payment.reservation_id);
        const snapshot = args.session_snapshot;
        const paid = snapshot?.attributes?.payments?.filter(row => row.attributes?.status === 'paid') ?? [];
        if (!event || !payment || !reservation || event.state !== 'pending'
          || event.session_id !== snapshot?.id || paid.length !== 1) {
          return { data: null, error: { code: '22023' } };
        }
        const transaction = paid[0];
        if (transaction.attributes.currency !== 'PHP' || transaction.attributes.amount !== payment.amount * 100
          || transaction.attributes.livemode !== false) return { data: null, error: { code: '22023' } };
        const result = payment.status === 'paid' ? 'duplicate' : 'paid';
        if (payment.status !== 'paid') {
          Object.assign(payment, { status: 'paid', attempt_state: 'complete', provider_payment_id: transaction.id,
            paid_at: payment.paid_at ?? new Date().toISOString() });
          Object.assign(reservation, { status: 'confirmed', payment_status: 'paid', paid_at: reservation.paid_at ?? payment.paid_at });
        }
        Object.assign(event, { state: 'processed', result });
        return { data: result, error: null };
      }
      return { data: null, error: { code: '42883' } };
    },
  };
  const env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
    PAYMONGO_SECRET_KEY: 'sk_test_fixture', PAYMONGO_WEBHOOK_SECRET: 'fixture-webhook-secret',
    PAYMONGO_TEST_WEBHOOK_SECRET: 'fixture-webhook-secret',
    CHECKOUT_RETURN_URL_ORIGINS: 'https://app.example.test', ...options.env };
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
      exports, Request, Response, Headers, TextEncoder, TextDecoder, URL, Date, AbortSignal, crypto: webcrypto, btoa, setTimeout, clearTimeout,
      console: { error() {}, warn() {}, log() {} },
      Deno: { env: { get: (name) => env[name] }, serve: (handler) => handlers.set(file, handler) },
      require: (name) => name.startsWith('https://esm.sh/')
        ? { createClient: () => client }
        : load(path.relative(root, path.resolve(path.dirname(absolute), name))),
      fetch: async (url, init = {}) => {
        const method = String(init.method ?? 'GET').toUpperCase();
        const parsedUrl = new URL(url);
        const payload = init.body ? JSON.parse(init.body) : null;
        const idempotencyKey = init.headers?.['Idempotency-Key'];
        // Retain only safe request metadata; never keep Authorization headers.
        calls.push({ method, path: parsedUrl.pathname, idempotencyKeyPresent: Boolean(idempotencyKey) });
        if (options.providerFailure) return Response.json({ errors: [{ detail: 'Injected provider failure' }] }, { status: 503 });
        const retrieval = parsedUrl.pathname.match(/\/v1\/checkout_sessions\/(cs_[A-Za-z0-9_]+)$/);
        if (method === 'GET' && retrieval) {
          const session = providerSessions.get(retrieval[1]);
          return session ? Response.json({ data: structuredClone(session) })
            : Response.json({ errors: [{ detail: 'Synthetic session not found' }] }, { status: 404 });
        }
        if (idempotencyKey && idempotentProviderResponses.has(idempotencyKey)) {
          return Response.json(structuredClone(idempotentProviderResponses.get(idempotencyKey)));
        }
        if (method !== 'POST' || !payload) return Response.json({ errors: [{ detail: 'Unsupported synthetic provider request' }] }, { status: 405 });
        const id = 'cs_test_' + (++sequence);
        const response = { data: { id, type: 'checkout_session', attributes: { ...payload.data.attributes,
          checkout_url: 'https://checkout.paymongo.com/' + id, livemode: false, status: 'active', payments: [] } } };
        providerSessions.set(id, response.data);
        if (idempotencyKey) idempotentProviderResponses.set(idempotencyKey, response);
        return Response.json(response);
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
    const payment = db.reservation_payments.find(row => row.provider_checkout_session_id === sessionId);
    const reservation = payment && db.reservations.find(row => row.id === payment.reservation_id);
    return { data: { id: 'evt_fixture', attributes: { type, livemode: false,
      data: { id: sessionId, type: 'checkout_session', attributes: {
        amount: 15000, currency: 'PHP', metadata: { checkout_attempt_id: payment?.id, reservation_id: reservation?.id }, ...attrs,
      } } } } };
  }
  async function webhook(payload, { timestamp = Math.floor(Date.now() / 1000), secret } = {}) {
    const live = payload?.data?.attributes?.livemode === true;
    secret ??= live ? env.PAYMONGO_WEBHOOK_SECRET : env.PAYMONGO_TEST_WEBHOOK_SECRET || env.PAYMONGO_WEBHOOK_SECRET;
    const raw = JSON.stringify(payload);
    const signature = createHmac('sha256', secret).update(timestamp + '.' + raw).digest('hex');
    return invoke('paymongo-webhook', raw, { token: '', headers: { 'paymongo-signature': `t=${timestamp},${live ? 'li' : 'te'}=${signature}` } });
  }
  return { db, calls, rpcCalls, writes, invoke, webhook, event };
}

const pendingPayment = {
  id: '30000000-0000-4000-8000-000000000001', reservation_id: '20000000-0000-4000-8000-000000000001',
  user_id: '40000000-0000-4000-8000-000000000001', spot_id: '10000000-0000-4000-8000-000000000001',
  provider: 'paymongo', payment_method: 'gcash', provider_checkout_session_id: 'cs_test_existing',
  checkout_url: 'https://checkout.paymongo.com/cs_test_existing', amount: 150, currency: 'PHP', status: 'pending',
  created_at: '2026-01-01T00:00:00Z',
};
module.exports = { fixture, pendingPayment };
