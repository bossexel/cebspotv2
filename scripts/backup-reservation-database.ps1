param([Parameter(Mandatory=$true)][ValidatePattern('^[a-z]{20}$')][string]$ProjectRef)
$ErrorActionPreference = 'Stop'
# Read-only Supabase queries. Private rows stay in memory and are encrypted with
# Windows DPAPI before writing to .private/. Never prints query response bodies.
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot
$privatePath = Join-Path $repoRoot '.private'
New-Item -ItemType Directory -Force -Path $privatePath | Out-Null
if ((git check-ignore .private/reservation-backup.dpapi) -ne '.private/reservation-backup.dpapi') {
  throw 'Private backup directory must be ignored by git.'
}
$snapshotSql = Get-Content -Raw -LiteralPath 'supabase/verification/reservation-schema-snapshot.sql'
$savedSystemCa = $env:NODE_USE_SYSTEM_CA
$env:NODE_USE_SYSTEM_CA = '1'
function Invoke-CatalogQuery([string]$SqlPath) {
  $savedErrorPreference = $ErrorActionPreference
  try {
    # Windows PowerShell treats even informational native stderr as an error.
    # Validate the exit code AND parsed API envelope below instead.
    $ErrorActionPreference = 'Continue'
    $raw = (& npx.cmd --offline supabase db query --linked --project-ref $ProjectRef --file $SqlPath --output json 2> (Join-Path $privatePath 'reservation-backup-cli-error.log')) | Out-String
  } finally { $ErrorActionPreference = $savedErrorPreference }
  if ($LASTEXITCODE -ne 0) { throw 'Read-only backup command failed; private diagnostic retained locally.' }
  try { $parsed = $raw | ConvertFrom-Json } catch { throw 'Read-only backup returned invalid JSON; no response body logged.' }
  if ($parsed.error -or -not $parsed.rows) { throw 'Read-only backup API returned no usable result.' }
  return @{ Raw=$raw; Document=$parsed }
}
try {
  $catalog = (Invoke-CatalogQuery 'supabase/verification/reservation-schema-snapshot.sql').Document.rows[0].catalog
  $dataParts = @(); $countParts = @()
  foreach ($table in $catalog.tables) {
    if ($table.name -notmatch '^[a-z_][a-z_0-9]*$') { throw 'Unexpected table identifier; stop for review.' }
    $name = $table.name
    $dataParts += "'$name',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.`"$name`" t)"
    $countParts += "'$name',(select count(*) from public.`"$name`")"
  }
  $dataParts += "'storage.buckets',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from storage.buckets t)"
  $countParts += "'storage.buckets',(select count(*) from storage.buckets)"
  $query = $snapshotSql.Replace('begin read only;', 'begin isolation level repeatable read read only;').Replace('select jsonb_build_object(', 'with captured as (select jsonb_build_object(')
  # Replace only the final SELECT terminator; inner JSON calls have no semicolon.
  $query = $query.Replace(') as catalog;', ") as catalog) select jsonb_build_object('catalog',(select catalog from captured),'data',jsonb_build_object($($dataParts -join ',')),'counts',jsonb_build_object($($countParts -join ','))) as snapshot;")
  $queryPath = Join-Path $privatePath 'reservation-backup-query.sql'
  [IO.File]::WriteAllText($queryPath, $query, [Text.UTF8Encoding]::new($false))
  $result = Invoke-CatalogQuery $queryPath
  $snapshot = $result.Document.rows[0].snapshot
  if (-not $snapshot.catalog -or -not $snapshot.data -or -not $snapshot.counts) { throw 'Incomplete backup document.' }
  $totalRows = 0
  foreach ($property in $snapshot.counts.PSObject.Properties) {
    $actual = @($snapshot.data.PSObject.Properties[$property.Name].Value).Count
    if ($actual -ne [long]$property.Value) { throw 'Backup row-count verification failed.' }
    $totalRows += $actual
  }
  Add-Type -AssemblyName System.Security
  $bytes = [Text.Encoding]::UTF8.GetBytes($result.Raw)
  $entropy = [Text.Encoding]::UTF8.GetBytes('CebSpot reservation pre-upgrade backup v1')
  $encrypted = [Security.Cryptography.ProtectedData]::Protect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $backupPath = Join-Path $privatePath ("reservation-preupgrade-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dpapi')
  [IO.File]::WriteAllBytes($backupPath,$encrypted)
  $restored = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($backupPath),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $sha = [Security.Cryptography.SHA256]::Create()
  if ([Convert]::ToBase64String($sha.ComputeHash($bytes)) -cne [Convert]::ToBase64String($sha.ComputeHash($restored))) { throw 'Encrypted backup failed round-trip verification.' }
  if (-not $snapshot.catalog.storage_policies) { throw 'Storage policy metadata missing from backup.' }
  $evidence = @{kind='encrypted-public-schema-and-data-backup'; project_ref=$ProjectRef; table_count=@($snapshot.counts.PSObject.Properties).Count; row_count=$totalRows; storage_policy_count=@($snapshot.catalog.storage_policies).Count; encrypted_roundtrip_verified=$true; created_utc=[DateTime]::UtcNow.ToString('o'); file=[IO.Path]::GetFileName($backupPath); limitations='Public database rows and schema plus Storage bucket metadata and policies only. Excludes Auth credentials/users and Storage object bytes. Not a full project restore rehearsal.'}
  $evidence | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath 'tests/remediation/evidence/reservation-backup-summary.json'
  Write-Output 'Encrypted backup saved and its decrypted contents verified in memory. No private rows were printed.'
} finally {
  $env:NODE_USE_SYSTEM_CA = $savedSystemCa
  $bytes=$null; $restored=$null; $result=$null; $snapshot=$null
}
