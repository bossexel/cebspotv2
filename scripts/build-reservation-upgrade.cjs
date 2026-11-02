// Deterministic, local-only builder. Never reads credentials or contacts a backend.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const output = 'supabase/migrations/20261101192553_align_reservation_backend.sql';
const sources = [
  '20261006000100_audit_authorization_hardening.sql',
  '20261011000100_table_booking_policy_and_walk_ins.sql',
  '20261013000100_activity_privacy.sql',
  '20261013000200_android_reservation_scope.sql',
  '20261013000300_manual_proof_and_bounded_holds.sql',
  '20261013000400_durable_checkout_and_payment_events.sql',
  '20261013000600_server_reservation_details.sql',
];

// Split top-level SQL only; semicolons in function bodies/strings are retained.
function statements(sql) {
  const result = []; let start = 0, quote = null, dollar = null, line = false, block = 0;
  for (let i = 0; i < sql.length; i++) {
    const a = sql[i], b = sql[i + 1];
    if (line) { if (a === '\n') line = false; continue; }
    if (block) { if (a === '/' && b === '*') { block++; i++; } else if (a === '*' && b === '/') { block--; i++; } continue; }
    if (dollar) { if (sql.startsWith(dollar, i)) { i += dollar.length - 1; dollar = null; } continue; }
    if (quote) { if (a === quote) { if (b === quote) i++; else quote = null; } continue; }
    if (a === '-' && b === '-') { line = true; i++; continue; }
    if (a === '/' && b === '*') { block = 1; i++; continue; }
    if (a === "'" || a === '"') { quote = a; continue; }
    if (a === '$') { const match = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/); if (match) { dollar = match[0]; i += dollar.length - 1; continue; } }
    if (a === ';') { result.push(sql.slice(start, i + 1).trim()); start = i + 1; }
  }
  if (quote || dollar || block) throw new Error('Unterminated SQL literal/comment');
  if (sql.slice(start).replace(/--[^\n]*(?:\n|$)/g, '').trim()) throw new Error('Unterminated SQL statement');
  return result;
}
function withoutComments(sql) { return sql.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '').trim(); }
const literal = value => "'" + value.replaceAll("'", "''") + "'";

function build() {
  const parts = [], names = new Set(), provenance = [];
  for (const name of sources) {
    const bytes = fs.readFileSync(path.join(root, 'supabase/migrations', name));
    provenance.push({ name, sha256: createHash('sha256').update(bytes).digest('hex') });
    parts.push(`-- Derived from ${name}; see builder for reviewed adaptations.`);
    for (const original of statements(bytes.toString('utf8'))) {
      let sql = withoutComments(original);
      if (/^(begin;|commit;|notify\s)/i.test(sql)) continue;
      if (name.startsWith('20261006000100') && !/^(?:create or replace function public\.enforce_reservation_insert_boundary\(|(?:create|drop) trigger (?:if exists )?reservations_enforce_booking_insert\b|drop policy if exists "reservations_update_owner")/i.test(sql)) continue;
      // Preserve existing business rows. Legacy holds already have a conservative
      // created_at fallback; confirmation must be performed by the actual owner.
      if (/^update public\.spots set is_reservable/i.test(sql)) continue;
      if (/^update public\.reservations set hold_expires_at/i.test(sql)) continue;
      if (/^update public\.reservation_payments set attempt_state/i.test(sql)) continue;
      // Preserve the installed identity guard and its trigger unchanged.
      if (name.includes('activity_privacy') && /^(create or replace function public\.guard_profile_identity|(?:drop|create) trigger (?:if exists )?profiles_identity_boundary)/i.test(sql)) continue;
      if (name.includes('android_reservation_scope') && /^alter function public\.get_venue_table_availability/i.test(sql)) continue;
      if (name.includes('table_booking_policy') && /^(create or replace function|revoke|grant).*public\.get_venue_table_availability/is.test(sql)) sql = sql.replaceAll('public.get_venue_table_availability', 'public.get_venue_table_inventory_availability');
      if (name.includes('table_booking_policy') && /^do\b/i.test(sql) && sql.includes('alter publication supabase_realtime add table')) {
        sql = sql.replace("if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then", "if exists (select 1 from pg_publication where pubname = 'supabase_realtime')\n    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='venue_table_states') then");
      }
      sql = sql.replace(/^create function /i, 'create or replace function ')
        .replace(/^create table (?!if not exists)/i, 'create table if not exists ')
        .replace(/^create (unique )?index (?!if not exists)/i, (_, unique) => `create ${unique || ''}index if not exists `);
      if (/^alter table /i.test(sql)) sql = sql.replace(/\badd column (?!if not exists)/gi, 'add column if not exists ');
      if (name.includes('durable_checkout') && /^alter table public\.reservation_payments/i.test(sql)) {
        // Only a newly added column classifies legacy attempts conservatively.
        // Existing status/provider IDs/amounts and existing attempt_state survive.
        sql = sql.replace("attempt_state text not null default 'active'", "attempt_state text not null default 'reconciliation_required'");
        sql += "\nalter table public.reservation_payments alter column attempt_state set default 'active';";
      }
      const policy = sql.match(/^create policy ("[^"]+"|\w+) on ([\w.]+)/i);
      if (policy) sql = `drop policy if exists ${policy[1]} on ${policy[2]};\n${sql}`;
      const trigger = sql.match(/^create trigger (\w+)[\s\S]*?\bon ([\w.]+)/i);
      if (trigger) sql = `drop trigger if exists ${trigger[1]} on ${trigger[2]};\n${sql}`;
      const rename = sql.match(/^alter function (public\.\w+)\(([^)]*)\) rename to (\w+);$/i);
      if (rename) {
        const source = `${rename[1]}(${rename[2]})`, target = `public.${rename[3]}(${rename[2]})`;
        sql = `do $rename$ begin\n  if to_regprocedure(${literal(target)}) is null then\n    ${sql}\n  end if;\nend $rename$;`;
      }
      const func = sql.match(/^create or replace function public\.(\w+)\(/i);
      if (func) names.add(func[1]);
      // Account-erasure migration extends this trigger with a narrowly scoped
      // service-only redaction exception. Preserve the installed validator;
      // the captured legacy schema has none and needs the source implementation.
      if (func?.[1] === 'validate_reservation_details') {
        sql = `do $details$ begin\n  if to_regprocedure('public.validate_reservation_details()') is null then\n    execute ${literal(sql)};\n  end if;\nend $details$;`;
      }
      parts.push(sql);
    }
  }
  const preflight = `begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
-- No foundation replay, business-row backfill, fixture inventory or history repair.
do $preflight$
declare prerequisite text;
begin
  foreach prerequisite in array array['public.spots','public.profiles','public.reservations',
    'public.reservation_payments','public.activities','public.owner_spot_access','public.spot_submissions'] loop
    if to_regclass(prerequisite) is null then raise exception 'Missing prerequisite: %',prerequisite; end if;
  end loop;
  if to_regprocedure('public.require_active_account()') is null
    or to_regprocedure('public.guard_profile_identity()') is null
    or to_regprocedure('public.is_current_user_admin()') is null then
    raise exception 'Existing identity prerequisites must be installed and reviewed first.';
  end if;
  if exists(select 1 from public.reservation_payments where provider_payment_id is not null
    group by provider_payment_id having count(*)>1) then
    raise exception 'Duplicate provider payment references require reconciliation before upgrade.';
  end if;
end $preflight$;
`;
  const security = `
-- Keep the installed account guard. Add confirmed-account checks for this scope,
-- including deletion-aware deployments, without weakening their existing checks.
create or replace function public.assert_reservation_account() returns void
language plpgsql security definer set search_path='' as $body$
declare deleting boolean := false;
begin
  if auth.uid() is null then return; end if;
  perform public.require_active_account();
  if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=auth.uid() and u.email_confirmed_at is not null) then
    raise exception 'A confirmed signed-in account is required.' using errcode='42501';
  end if;
  if to_regclass('public.account_deletion_requests') is not null then
    execute 'select exists(select 1 from public.account_deletion_requests where user_id=$1)'
      into deleting using auth.uid();
    if deleting then raise exception 'Account deletion in progress.' using errcode='42501'; end if;
  end if;
end $body$;
revoke all on function public.assert_reservation_account() from public,anon,authenticated;

create or replace function public.guard_reservation_actor() returns trigger
language plpgsql security definer set search_path='' as $body$
begin
  if current_setting('role',true) in ('anon','authenticated') and auth.uid() is null then
    raise exception 'Authentication required.' using errcode='42501';
  end if;
  perform public.assert_reservation_account();
  if tg_op='DELETE' then return old; end if;
  return new;
end $body$;
revoke all on function public.guard_reservation_actor() from public,anon,authenticated;
drop trigger if exists reservations_account_boundary on public.reservations;
create trigger reservations_account_boundary before insert or update or delete on public.reservations
  for each row execute function public.guard_reservation_actor();
drop trigger if exists walk_in_account_boundary on public.walk_in_visits;
create trigger walk_in_account_boundary before insert or update or delete on public.walk_in_visits
  for each row execute function public.guard_reservation_actor();

-- Source-derived replacements retain the same guard in definer RPCs, whose
-- writes bypass RLS. Public availability remains readable without signing in.
do $guards$
declare f record; definition text; replacement text; body text;
begin
  for f in select p.oid,p.prosrc,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join pg_language l on l.oid=p.prolang
    where n.nspname='public' and p.proname=any(array[${[...names].sort().map(literal).join(',')}])
      and p.prosecdef and p.prorettype<>'trigger'::regtype and p.provolatile<>'i'
      and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))
  loop
    body := case when f.lanname='sql' then 'select public.assert_reservation_account();'||chr(10)||f.prosrc
      else 'begin perform public.assert_reservation_account();'||chr(10)||f.prosrc||chr(10)||'end;' end;
    definition:=pg_get_functiondef(f.oid);
    replacement:=replace(definition,'AS $function$'||f.prosrc||'$function$','AS $function$'||body||'$function$');
    if replacement=definition then raise exception 'Unexpected function format; stop for review.'; end if;
    execute replacement;
  end loop;
end $guards$;
-- Table grants are explicit; current Supabase projects need not inherit defaults.
grant all on public.walk_in_visits,public.venue_table_states to service_role;
revoke all on public.walk_in_visits,public.venue_table_states,public.payment_session_retirements,public.payment_webhook_events from public;
revoke insert,update,delete on public.reservation_payments from public;
-- Legacy admin policy applied to PUBLIC can evaluate an authenticated-only
-- helper during an anonymous activity read. Retain it for authenticated admins.
do $policy_role$ begin
  if exists(select 1 from pg_policies where schemaname='public' and tablename='activities' and policyname='activities_admin_select') then
    alter policy activities_admin_select on public.activities to authenticated;
  end if;
end $policy_role$;
-- Restrictive guards also close legacy explicit column grants/overlapping policies.
drop policy if exists reservations_server_updates on public.reservations;
create policy reservations_server_updates on public.reservations as restrictive for update to anon,authenticated using(false) with check(false);
drop policy if exists reservations_server_deletes on public.reservations;
create policy reservations_server_deletes on public.reservations as restrictive for delete to anon,authenticated using(false);
notify pgrst,'reload schema';
commit;
`;
  return { sql: '-- GENERATED: node scripts/build-reservation-upgrade.cjs\n-- Read docs/reservation-schema-upgrade.md before application.\n' + preflight + '\n' + parts.join('\n\n') + '\n' + security, provenance };
}
if (require.main === module) {
  const { sql, provenance } = build();
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(path.join(root, output), 'utf8') !== sql) throw new Error('Generated reservation upgrade is stale');
    console.log('Reservation upgrade matches its source migrations.');
  } else {
    fs.writeFileSync(path.join(root, output), sql);
    fs.mkdirSync(path.join(root, 'tests/remediation/evidence'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tests/remediation/evidence/reservation-upgrade-sources.json'), JSON.stringify({ output, sources: provenance }, null, 2) + '\n');
    console.log('Generated focused reservation upgrade.');
  }
}
module.exports = { build, statements, withoutComments, output };
