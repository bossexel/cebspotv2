// Restore catalog definitions into a NEW isolated loopback PostgreSQL cluster.
// Never restores user records and never connects to a hosted database.
const { startPostgres } = require('./postgres.cjs');
const { platformFixture } = require('./database.cjs');
const path = require('node:path');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
async function fromCatalog(catalog) {
  if ((catalog.enums || []).length || (catalog.sequences || []).length) throw new Error('Catalog fixture needs explicit enum/sequence support');
  const db = await startPostgres(path.resolve(__dirname, '../..'));
  try {
    await db.exec(platformFixture);
    await db.exec('set check_function_bodies=off;');
    for (const table of catalog.tables) {
      const columns = catalog.columns.filter(c => c.table_name === table.name).map(c => {
        if (c.identity_kind || c.generated_kind) throw new Error('Generated columns require explicit fixture support');
        return `${quote(c.name)} ${c.type}${c.not_null ? ' not null' : ''}`;
      });
      await db.exec(`create table public.${quote(table.name)} (${columns.join(',')})`);
    }
    for (const f of catalog.functions) await db.exec(f.definition);
    for (const v of catalog.views || []) await db.exec(`create view public.${quote(v.name)}${v.options?.length ? ` with (${v.options.join(',')})` : ''} as ${v.definition}`);
    for (const c of catalog.columns.filter(c => c.default_expr)) await db.exec(`alter table public.${quote(c.table_name)} alter column ${quote(c.name)} set default ${c.default_expr}`);
    for (const c of [...catalog.constraints].sort((a,b) => Number(a.kind === 'f')-Number(b.kind === 'f'))) await db.exec(`alter table public.${quote(c.table_name)} add constraint ${quote(c.name)} ${c.definition}`);
    for (const i of catalog.indexes.filter(i => !i.constraint_owned)) await db.exec(i.definition);
    for (const t of catalog.triggers) await db.exec(t.definition);
    for (const p of catalog.policies) await db.exec(`create policy ${quote(p.policyname)} on public.${quote(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(quote).join(',')}${p.qual ? ` using (${p.qual})` : ''}${p.with_check ? ` with check (${p.with_check})` : ''}`);
    const roles = new Set(['anon','authenticated','service_role','PUBLIC']);
    for (const t of catalog.tables) {
      await db.exec(`revoke all on public.${quote(t.name)} from public,anon,authenticated,service_role`);
      if (t.rls) await db.exec(`alter table public.${quote(t.name)} enable row level security`);
      if (t.force_rls) await db.exec(`alter table public.${quote(t.name)} force row level security`);
    }
    for (const g of catalog.table_grants.filter(g => roles.has(g.grantee))) await db.exec(`grant ${g.privilege_type} on public.${quote(g.table_name)} to ${g.grantee === 'PUBLIC' ? 'public' : quote(g.grantee)}${g.is_grantable === 'YES' ? ' with grant option' : ''}`);
    for (const g of (catalog.column_grants || []).filter(g => roles.has(g.grantee))) await db.exec(`grant ${g.privilege_type} (${quote(g.column_name)}) on public.${quote(g.table_name)} to ${g.grantee === 'PUBLIC' ? 'public' : quote(g.grantee)}${g.is_grantable === 'YES' ? ' with grant option' : ''}`);
    for (const f of catalog.functions) {
      await db.exec(`revoke all on function public.${quote(f.name)}(${f.args}) from public,anon,authenticated,service_role`);
      for (const g of f.grants || []) if (roles.has(g.grantee)) await db.exec(`grant execute on function public.${quote(f.name)}(${f.args}) to ${g.grantee === 'PUBLIC' ? 'public' : quote(g.grantee)}`);
    }
    for (const p of catalog.publication_tables || []) if (p.pubname === 'supabase_realtime') await db.exec(`alter publication supabase_realtime add table public.${quote(p.tablename)}`);
    // Auth itself is a synthetic platform contract, not a copy of hosted accounts.
    await db.exec('create trigger fixture_new_auth_user after insert on auth.users for each row execute function public.handle_new_user(); set check_function_bodies=on;');
    db.as = async (id, client = db, role = 'authenticated') => {
      if (!['anon','authenticated','service_role'].includes(role)) throw new Error('Unexpected fixture role');
      await client.query('reset role');
      await client.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id || '',role]);
      await client.query(`set role ${role}`);
    };
    return db;
  } catch (error) { await db.close(); throw error; }
}
module.exports = { fromCatalog };
