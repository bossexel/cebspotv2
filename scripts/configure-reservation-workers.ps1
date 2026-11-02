param([Parameter(Mandatory=$true)][ValidatePattern('^[a-z]{20}$')][string]$ProjectRef,
  [Parameter(Mandatory=$true)][uri]$ReturnBridge)
$ErrorActionPreference='Stop'
if($ReturnBridge.Scheme -ne 'https' -or $ReturnBridge.AbsolutePath -ne '/payment-return.html' -or $ReturnBridge.Query -or $ReturnBridge.Fragment -or $ReturnBridge.UserInfo){throw 'Verified HTTPS return bridge required'}
$repoRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot
if((git check-ignore .private/reservation-worker-settings.dpapi) -ne '.private/reservation-worker-settings.dpapi'){throw 'Private output directory must be ignored'}
New-Item -ItemType Directory -Force .private | Out-Null
$savedCa=$env:NODE_USE_SYSTEM_CA
$env:NODE_USE_SYSTEM_CA='1'
$settings=@{}
$temporaryPath=Join-Path $repoRoot ('.private/worker-settings-'+[guid]::NewGuid().ToString('N')+'.txt')
function Read-SecretNames {
  $preference=$ErrorActionPreference
  try{$ErrorActionPreference='Continue';$raw=(& npx.cmd --offline supabase secrets list --project-ref $ProjectRef --output json 2> .private/worker-settings-list-stderr.log)|Out-String}
  finally{$ErrorActionPreference=$preference}
  if($LASTEXITCODE -ne 0){throw 'Unable to list secret names'}
  $items=$raw|ConvertFrom-Json
  if($items -isnot [Array]){throw 'Unexpected secret metadata envelope'}
  return @($items|ForEach-Object {$_.name})
}
try{
  $names=Read-SecretNames
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  foreach($name in @('PAYMENT_WORKER_TOKEN','PRIVATE_UPLOAD_WORKER_TOKEN')){
    if($name -notin $names){$bytes=New-Object byte[] 48;$rng.GetBytes($bytes);$settings[$name]=[Convert]::ToBase64String($bytes)}
  }
  if('CHECKOUT_RETURN_BASE_URL' -notin $names){$settings['CHECKOUT_RETURN_BASE_URL']=$ReturnBridge.AbsoluteUri}
  if($settings.Count -eq 0){Write-Output 'Required settings already exist; no values changed.';exit 0}
  Add-Type -AssemblyName System.Security
  $payload=[Text.Encoding]::UTF8.GetBytes(($settings|ConvertTo-Json -Compress))
  $entropy=[Text.Encoding]::UTF8.GetBytes('CebSpot reservation worker setup v1')
  $encrypted=[Security.Cryptography.ProtectedData]::Protect($payload,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $backupPath=Join-Path $repoRoot ('.private/reservation-worker-settings-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.dpapi')
  [IO.File]::WriteAllBytes($backupPath,$encrypted)
  [IO.File]::WriteAllLines($temporaryPath,@($settings.Keys|Sort-Object|ForEach-Object {$_+'='+$settings[$_]}),[Text.UTF8Encoding]::new($false))
  $preference=$ErrorActionPreference
  try{$ErrorActionPreference='Continue';& npx.cmd --offline supabase secrets set --project-ref $ProjectRef --env-file $temporaryPath 1> .private/worker-settings-result.log 2> .private/worker-settings-stderr.log}
  finally{$ErrorActionPreference=$preference}
  if($LASTEXITCODE -ne 0){throw 'Settings command failed; generated values retained encrypted for recovery'}
  $after=Read-SecretNames
  if(@($settings.Keys|Where-Object {$_ -notin $after}).Count){throw 'Settings metadata verification failed'}
  @{project_ref=$ProjectRef;configured_names=@($settings.Keys|Sort-Object);existing_values_changed=$false;provider_keys_changed=$false;generated_values_backup=[IO.Path]::GetFileName($backupPath);verified_utc=[DateTime]::UtcNow.ToString('o')}|
    ConvertTo-Json|Set-Content -Encoding utf8 tests/remediation/evidence/reservation-worker-settings.json
  Write-Output 'Missing worker and return settings installed. Provider keys and existing values were not changed.'
}finally{
  if(Test-Path -LiteralPath $temporaryPath){Remove-Item -LiteralPath $temporaryPath -Force}
  $env:NODE_USE_SYSTEM_CA=$savedCa
  $settings=$null;$payload=$null;$bytes=$null
}
