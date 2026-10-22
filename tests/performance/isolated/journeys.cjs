'use strict';
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { save } = require('./fixtures.cjs');
const { bookingConflict } = require('./client.cjs');
const { discoveryLogic, loadTs } = require('./app-logic.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const active = r => !['cancelled', 'completed', 'no_show'].includes(r.status);
function reservation(m, session, spot, sequence, { date, table, slot = 'prime' } = {}) {
  const selected = table || spot.table_inventory[slot][sequence % 20];
  // Distinct table/date combinations for routine load; a separate race deliberately shares one combination.
  const day = new Date(m.created); day.setUTCDate(day.getUTCDate() + 30 + Math.floor(sequence / 400));
  return { id: randomUUID(), user_id: session.id, spot_id: spot.id, spot_name: spot.name,
    reservation_date: date || day.toISOString().slice(0, 10), reservation_time: '20:00', reservation_time_start: '20:00',
    reservation_time_end: '22:30', guest_count: 2, guests: 2, slot_id: slot, table_id: selected.tableId,
    group_size_type: 'couple', note: m.runId, qr_code: `${m.runId}-${randomUUID()}`,
    guest_name: 'Synthetic Explorer', guest_email: 'synthetic@example.test', guest_phone: '09170000000',
    status: 'pending', payment_status: 'not_required', reservation_type: 'free', reservation_fee: 0, fee: 0, payment_required: false };
}
function createJourneys(ctx) {
  const { config: c, manifest: m, request, measure } = ctx;
  const logic = discoveryLogic(), { rankSimilarSpots } = loadTs('src/utils/similarSpots.ts');
  let sequence = 0, writes = 0;
  const fixtureIds = new Set(m.spots.map(s => s.id));
  async function call(op, method, endpoint, options, validate, { conflict = false } = {}) {
    const result = await request(method, endpoint, options);
    const expected = conflict && bookingConflict(result);
    const valid = result.ok && Boolean(validate(result.data));
    measure(op, result, valid, expected);
    return { ...result, valid, conflict: expected };
  }
  function journal(kind, id) {
    if (++writes > c.maxWrites) { ctx.stop('Write budget exhausted'); throw Error('Write budget exhausted'); }
    m[kind].push(id); save(c, m);
  }
  async function list(limit = 500, offset = 0, operation = 'listing_discovery') {
    return call(operation, 'GET', `/rest/v1/spots?select=*&is_public=eq.true&order=created_at.desc&limit=${limit}&offset=${offset}`, {},
      d => Array.isArray(d) && d.length === limit && d.every(s => fixtureIds.has(s.id) && s.is_public && Number.isFinite(Number(s.latitude))));
  }
  async function readJourney(session, vu) {
    const discovered = await list();
    if (!discovered.valid) return;
    const p1 = await list(20, 0, 'listing_page');
    const p2 = await list(20, 20, 'listing_page');
    if (p1.valid && p2.valid && p2.data.some(s => p1.data.some(p => p.id === s.id))) ctx.integrity('Pagination overlap');
    await sleep(c.pace);
    const enhanced = logic.enhance(discovered.data);
    const started = performance.now();
    const search = ['Synthetic', 'Cafe', 'Cebu', 'Outdoor'][vu % 4];
    const filters = { category: ['All', 'Outdoor', 'Specialty Coffee', 'Club'][vu % 4], minRating: [0, 3, 4.5][vu % 3], maxDistance: [1, 5, 10, 25, 50][vu % 5] };
    const filtered = logic.filter(enhanced, search, filters);
    ctx.local('search_filter', performance.now() - started, filtered.every(s => {
      const labels = [s.category, ...(s.categories || [])];
      return (s.name.toLowerCase().includes(search.toLowerCase()) || s.address.toLowerCase().includes(search.toLowerCase()) ||
        labels.some(label => label.toLowerCase().includes(search.toLowerCase()))) &&
        (filters.category === 'All' || labels.includes(filters.category)) && s.rating >= filters.minRating && s.distanceValue <= filters.maxDistance;
    }));
    const spot = m.spots[(vu + sequence) % m.spots.length];
    await call('detail', 'GET', `/rest/v1/spots?select=*&id=eq.${spot.id}`, {}, d => Array.isArray(d) && d.length === 1 && d[0].id === spot.id);
    await call('reviews', 'GET', `/rest/v1/reviews?select=*&spot_id=eq.${spot.id}&order=created_at.desc`, {},
      d => Array.isArray(d) && d.length >= 1 && d.every(r => r.spot_id === spot.id));
    const rankStart = performance.now(), ranked = rankSimilarSpots(spot, discovered.data);
    ctx.local('recommendation_rank', performance.now() - rankStart, ranked.length > 0 && ranked.every(r => r.spot.id !== spot.id && r.spot.is_public));
    await sleep(c.pace);
    await call('user_reservations', 'GET', `/rest/v1/reservations?select=*&user_id=eq.${session.id}&order=created_at.desc`, { token: session.token },
      d => Array.isArray(d) && d.every(r => r.user_id === session.id));
  }
  async function writeJourney(session, vu) {
    if (ctx.stopped()) return;
    const index = sequence++, spot = m.spots[index % 20];
    // Rotate across 20 venues * 20 tables before advancing the date.
    const payload = reservation(m, session, spot, Math.floor(index / 20), { date: (() => {
      const date = new Date(m.created); date.setUTCDate(date.getUTCDate() + 30 + Math.floor(index / 400)); return date.toISOString().slice(0, 10);
    })() });
    const available = await call('availability', 'POST', '/rest/v1/rpc/check_reservation_slot_available', { token: session.token,
      body: { target_spot_id: spot.id, target_reservation_date: payload.reservation_date, target_slot_id: payload.slot_id, target_table_id: payload.table_id } }, d => d === true);
    if (!available.valid || ctx.stopped()) return;
    journal('reservations', payload.id);
    const created = await call('reservation_create', 'POST', '/rest/v1/reservations', { token: session.token, body: payload, headers: { Prefer: 'return=representation' } },
      d => Array.isArray(d) && d.length === 1 && d[0].id === payload.id && d[0].user_id === session.id && d[0].table_id === payload.table_id &&
        d[0].status === 'pending' && d[0].payment_status === 'not_required', { conflict: true });
    const stored = await call('reservation_verify', 'GET', `/rest/v1/reservations?select=*&id=eq.${payload.id}`, { token: session.token },
      d => Array.isArray(d) && (created.valid ? d.length === 1 && d[0].user_id === session.id && active(d[0]) : d.length === 0));
    if (!stored.valid) ctx.integrity('Reservation result/record mismatch');
    if (ctx.mediaEnabled && index % ctx.mediaEvery === vu % ctx.mediaEvery) await submit(session, index);
  }
  async function submit(session, index) {
    const urls = [];
    for (const [type, file, mime] of [['photo', ctx.photo, 'image/jpeg'], ['video', ctx.video, 'video/mp4']]) {
      const key = `${session.id}/${m.runId}/${randomUUID()}.${type === 'photo' ? 'jpg' : 'mp4'}`;
      m.storage.push(key); save(c, m);
      const mediaBytes = fs.readFileSync(file);
      const upload = await call(`upload_${type}`, 'POST', '/storage/v1/object/spot-images/' + key,
        { token: session.token, binary: true, body: mediaBytes, headers: { 'Content-Type': mime, 'x-upsert': 'false' } }, d => d && typeof d.Key === 'string');
      if (!upload.valid) return;
      const download = await request('GET', '/storage/v1/object/public/spot-images/' + key, { binary: true });
      const validMedia = download.ok && download.buffer?.length === mediaBytes.length && Buffer.from(download.buffer).equals(mediaBytes);
      measure(`verify_${type}`, download, validMedia, false);
      if (!validMedia) { ctx.integrity('Stored media differs from uploaded fixture'); return; }
      urls.push(c.origin + '/storage/v1/object/public/spot-images/' + key);
    }
    const id = randomUUID(), category = m.spots[index % m.spots.length].category;
    journal('submissions', id);
    const payload = { id, submitter_id: session.id, name: `[${m.runId}] Submission ${index}`, description: 'Synthetic submission',
      category, categories: [category, 'Social Hub'], address: 'Synthetic Cebu fixture', latitude: 10.3 + index * .00001,
      longitude: 123.9, images: urls, is_reservable: false, reservation_type: 'free', reservation_fee: 0, payment_required: false };
    const created = await call('submission_create', 'POST', '/rest/v1/spot_submissions', { token: session.token, body: payload,
      headers: { Prefer: 'return=representation' } }, d => Array.isArray(d) && d.length === 1 && d[0].id === id && d[0].status === 'pending' &&
        d[0].images?.length === 2 && d[0].images.every((url, i) => url === urls[i]) && d[0].categories?.includes(category));
    if (!created.valid) return;
    const verified = await call('submission_verify', 'GET', `/rest/v1/spot_submissions?select=*&id=eq.${id}`, { token: session.token },
      d => Array.isArray(d) && d.length === 1 && d[0].submitter_id === session.id && d[0].images?.length === 2);
    if (!verified.valid) ctx.integrity('Submission result/record mismatch');
    // App publishes activity and a grouped local update. These are DB writes, never notification transport.
    const aid = randomUUID(); journal('activities', aid);
    await call('submission_activity', 'POST', '/rest/v1/activities', { token: session.token, body: { id: aid, user_id: session.id,
      user_name: 'Synthetic Explorer', action: 'submitted', target_id: id, target_name: payload.name, type: 'submission', spot_name: payload.name },
      headers: { Prefer: 'return=representation' } }, d => Array.isArray(d) && d[0]?.id === aid);
    const grouped = await call('submission_publish', 'POST', '/rest/v1/rpc/publish_spot_submission_local_update', {
      token: session.token, body: { target_submission_id: id } }, d => Array.isArray(d) && d.length === 1 && typeof d[0].local_update_id === 'string');
    if (grouped.valid) { m.localUpdates.push(grouped.data[0].local_update_id); save(c, m); }
  }
  return { list, readJourney, writeJourney, call, submit };
}
module.exports = { sleep, active, reservation, createJourneys };
