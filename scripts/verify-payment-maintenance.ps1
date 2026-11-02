# Executes only the authorized test-mode maintenance worker. No provider key or
# raw record is read locally; evidence contains bounded aggregate counts only.
$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
Add-Type -AssemblyName System.Security
$metadata=Get-Content -Raw tests/remediation/evidence/reservation-worker-settings.json|ConvertFrom-Json
if($metadata.project_ref -ne 'fathkdyxgeeokxeobxqp'){throw 'Unexpected worker settings project'}
$name=$metadata.generated_values_backup
if([IO.Path]::GetFileName($name) -ne $name -or $name -notmatch '^reservation-worker-settings-[0-9-]+\.dpapi$'){throw 'Invalid worker settings path'}
$path=Join-Path '.private' $name
if((git check-ignore $path.Replace('\','/')) -ne $path.Replace('\','/')){throw 'Worker settings must remain ignored'}
$payload=$null;$settings=$null;$headers=$null
try{
  $ready=Invoke-WebRequest -Uri 'https://fathkdyxgeeokxeobxqp.supabase.co/functions/v1/payment-readiness' -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 30
  if(($ready.Content|ConvertFrom-Json).checks.testModeConfigured -ne $true){throw 'Test payment mode is not verified'}
  $payload=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path (Get-Location) $path)),[Text.Encoding]::UTF8.GetBytes('CebSpot reservation worker setup v1'),[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $settings=[Text.Encoding]::UTF8.GetString($payload)|ConvertFrom-Json
  if(-not $settings.PAYMENT_WORKER_TOKEN -or $settings.PAYMENT_WORKER_TOKEN.Length -lt 32){throw 'Worker token unavailable'}
  $headers=@{Authorization='Bearer '+$settings.PAYMENT_WORKER_TOKEN}
  try{$response=Invoke-WebRequest -Uri 'https://fathkdyxgeeokxeobxqp.supabase.co/functions/v1/payment-maintenance' -Method Post -Headers $headers -Body '{}' -ContentType 'application/json' -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 60}
  catch{throw 'Test payment maintenance failed; checkout admission must remain closed pending verification'}
  $result=$response.Content|ConvertFrom-Json
  if($response.StatusCode -ne 200 -or $result.ok -ne $true -or -not $result.counts){throw 'Unexpected maintenance response'}
  foreach($key in @('recovered','reconciled','retired','failed','manual')){
    $v=$result.counts.$key
    if($null -eq $v -or $v -isnot [ValueType] -or $v -lt 0 -or $v -gt 100000 -or [double]$v -ne [Math]::Floor([double]$v)){throw 'Invalid maintenance aggregate'}
  }
  $safe=@{checkedAt=[DateTime]::UtcNow.ToString('o');testOnly=$true;httpStatus=200;ok=$result.ok;counts=$result.counts}
  $safe|ConvertTo-Json -Depth 4|Set-Content -Encoding utf8 tests/remediation/evidence/payment-rollout-2026-11-03-maintenance-invocation.json
  if($result.counts.failed -ne 0 -or $result.counts.manual -ne 0){throw 'Maintenance reports unresolved work'}
  Write-Output 'Protected test payment maintenance passed; aggregate evidence saved.'
}finally{
  if($payload){[Array]::Clear($payload,0,$payload.Length)}
  $payload=$null;$settings=$null;$headers=$null
}
