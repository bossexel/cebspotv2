param([switch]$Activate,[switch]$ScheduleMaintenance)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
Add-Type -AssemblyName System.Security
$metadata=Get-Content -Raw tests/remediation/evidence/reservation-worker-settings.json|ConvertFrom-Json
if($metadata.project_ref -ne 'fathkdyxgeeokxeobxqp'){throw 'Unexpected worker settings project'}
$name=$metadata.generated_values_backup
if([IO.Path]::GetFileName($name) -ne $name -or $name -notmatch '^reservation-worker-settings-[0-9-]+\.dpapi$'){throw 'Invalid worker settings path'}
$privatePath=Join-Path '.private' $name
if((git check-ignore $privatePath.Replace('\','/')) -ne $privatePath.Replace('\','/')){throw 'Worker settings must remain ignored'}
$payload=$null;$settings=$null;$headers=$null
try{
  $payload=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path (Get-Location) $privatePath)),[Text.Encoding]::UTF8.GetBytes('CebSpot reservation worker setup v1'),[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $settings=[Text.Encoding]::UTF8.GetString($payload)|ConvertFrom-Json
  if(-not $settings.PAYMENT_WORKER_TOKEN -or $settings.PAYMENT_WORKER_TOKEN.Length -lt 32){throw 'Worker token unavailable'}
  $headers=@{Authorization='Bearer '+$settings.PAYMENT_WORKER_TOKEN}
  $endpoint='https://fathkdyxgeeokxeobxqp.supabase.co/functions/v1/payment-release-control'
  function Invoke-Control([string]$Method,[string]$Body){
    try{
      $arguments=@{Uri=$endpoint;Method=$Method;Headers=$headers;UseBasicParsing=$true;MaximumRedirection=0;TimeoutSec=55}
      if($Body){$arguments.Body=$Body;$arguments.ContentType='application/json'}
      $response=Invoke-WebRequest @arguments
      $document=$response.Content|ConvertFrom-Json
    }catch{throw 'Protected test webhook operation failed; inspect current state before retrying'}
    if($response.StatusCode -ne 200 -or $document.testOnly -ne $true -or $document.scopeHash -notmatch '^[a-f0-9]{64}$'){throw 'Unexpected test webhook response'}
    return $document
  }
  $before=Invoke-Control 'GET' $null
  $result=$before
  if($Activate -or $ScheduleMaintenance){
    $gate=Get-Content -Raw tests/remediation/evidence/commands/payment-rollout-2026-11-03-full.json|ConvertFrom-Json
    if($gate.exitCode -ne 0){throw 'Local verification gate failed'}
    if($before.matchingEnabledTestHooks -ne 1 -or $before.secretMatches -ne $true){throw 'Test webhook identity/signing configuration is not verified'}
    $action=if($ScheduleMaintenance){'configure-maintenance'}else{'activate-test-webhook'}
    $body=@{action=$action;expectedScopeHash=$before.scopeHash}|ConvertTo-Json -Compress
    $result=Invoke-Control 'POST' $body
    if($result.routedToDurableTestHandler -ne $true){throw 'Durable test webhook routing is not verified'}
    if($ScheduleMaintenance -and $result.maintenanceScheduled -ne $true){throw 'Maintenance schedule is not verified'}
  }
  $label=if($ScheduleMaintenance){'scheduled'}elseif($Activate){'activated'}else{'inspection'}
  @{checkedAt=[DateTime]::UtcNow.ToString('o');testOnly=$true;requestedWrite=[bool]($Activate -or $ScheduleMaintenance);result=$result}|ConvertTo-Json -Depth 5|Set-Content -Encoding utf8 ('tests/remediation/evidence/payment-rollout-2026-11-03-webhook-'+$label+'.json')
  Write-Output ('Test webhook '+$label+' completed; secret values and provider identifiers were not saved.')
}finally{
  if($payload){[Array]::Clear($payload,0,$payload.Length)}
  $payload=$null;$settings=$null;$headers=$null
}
