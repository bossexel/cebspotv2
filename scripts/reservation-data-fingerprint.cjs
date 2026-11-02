// Local query builder only. Never reads application rows or connects to a host.
// The resulting read-only query returns aggregate hashes, never private records.
const fs = require('node:fs');
const [capture, output] = process.argv.slice(2);
if (!capture || !output) throw new Error('Usage: node scripts/reservation-data-fingerprint.cjs <catalog.json> <output.sql>');
const catalog = JSON.parse(fs.readFileSync(capture, 'utf8').replace(/^\uFEFF/, '')).rows[0].catalog;
const quote = name => {
  if (!/^[a-z_][a-z_0-9]*$/.test(name)) throw new Error('Unexpected catalog identifier');
  return '"' + name + '"';
};
const statements = catalog.tables.map(table => {
  const columns = catalog.columns.filter(column => column.table_name === table.name).map(column => quote(column.name)).join(',');
  return `select '${table.name}' as table_name,count(*) as row_count,md5(coalesce(string_agg(row_value,E'\\n' order by row_value),'')) as digest from (select to_jsonb(original_row)::text row_value from (select ${columns} from public.${quote(table.name)}) original_row) rows`;
});
fs.writeFileSync(output, `begin isolation level repeatable read read only;\nset local statement_timeout='30s';\nselect jsonb_agg(to_jsonb(t) order by table_name) as fingerprints from (${statements.join('\nunion all\n')}) t;\nrollback;\n`);
console.log('Read-only aggregate fingerprint query written. Original columns only.');
