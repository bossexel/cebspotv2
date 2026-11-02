param([switch]$Apply,[switch]$RetireUnused)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if($RetireUnused -and -not $Apply){throw 'RetireUnused requires the explicit Apply switch'}
if(-not $Apply){& "$PSScriptRoot/inspect-legacy-test-payments.ps1";exit $LASTEXITCODE}
$gate=Get-Content -Raw tests/remediation/evidence/commands/reservation-2026-11-02-full-legacy-serial.json|ConvertFrom-Json
if($gate.exitCode -ne 0){throw 'Final local verification gate failed'}
$backup=Get-Content -Raw tests/remediation/evidence/reservation-backup-summary.json|ConvertFrom-Json
if(-not $backup.encrypted_roundtrip_verified -or -not(Test-Path -LiteralPath ('.private/'+$backup.file))){throw 'Verified encrypted backup required'}
Add-Type -AssemblyName System.Security
$metadata=Get-Content -Raw tests/remediation/evidence/reservation-worker-settings.json|ConvertFrom-Json
if($metadata.project_ref -ne 'fathkdyxgeeokxeobxqp'){throw 'Unexpected worker settings project'}
$fileName=$metadata.generated_values_backup
if([IO.Path]::GetFileName($fileName) -ne $fileName -or $fileName -notmatch '^reservation-worker-settings-[0-9-]+\.dpapi$'){throw 'Invalid encrypted worker settings path'}
$privatePath=Join-Path '.private' $fileName
if((git check-ignore $privatePath.Replace('\','/')) -ne $privatePath.Replace('\','/')){throw 'Worker settings file must remain ignored'}
$payload=$null;$settings=$null;$headers=$null;$token=$null
$action=if($RetireUnused){'retire-unused'}else{'reconcile-terminal'}
$counts=@{paidRecorded=0;expiredRecorded=0;openUnchanged=0;skipped=0;failed=0}
$batches=0;$success=$false
try{
  $payload=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path (Get-Location) $privatePath)),[Text.Encoding]::UTF8.GetBytes('CebSpot reservation worker setup v1'),[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $settings=[Text.Encoding]::UTF8.GetString($payload)|ConvertFrom-Json;$token=$settings.PAYMENT_WORKER_TOKEN
  if(-not $token -or $token.Length -lt 32){throw 'Generated worker token unavailable'}
  $headers=@{Authorization='Bearer '+$token};$cursor=$null
  do{
    $body=@{action=$action};if($cursor){$body.after=$cursor}
    $json=$body|ConvertTo-Json -Compress
    try{
      $response=Invoke-WebRequest -Uri 'https://fathkdyxgeeokxeobxqp.supabase.co/functions/v1/payment-reconcile-legacy-test' -Method Post -Headers $headers -ContentType 'application/json' -Body $json -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 150
      $report=$response.Content|ConvertFrom-Json
    }catch{
      # A non-2xx may contain safe aggregate counts and a private pagination ID.
      # Parse in memory only; never print/persist the raw body or error details.
      if($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 503){
        $reader=New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
        try{try{$report=$reader.ReadToEnd()|ConvertFrom-Json}catch{throw 'Malformed reconciliation failure response'}}finally{$reader.Dispose()}
      }else{throw 'Protected reconciliation request failed; verify state before retrying'}
    }
    if(-not $report.counts -or $report.action -ne $action){throw 'Invalid reconciliation response'}
    foreach($key in @($counts.Keys)){
      $value=$report.counts.$key
      if($null -eq $value -or $value -isnot [ValueType] -or $value -lt 0 -or $value -gt 5 -or [double]$value -ne [Math]::Floor([double]$value)){throw 'Invalid aggregate result count'}
      $counts[$key]+=$value
    }
    $batches++
    if($report.ok -ne $true -or $counts.failed -gt 0 -or $counts.skipped -gt 0){throw 'Reconciliation has unresolved records; aggregate evidence retained'}
    $next=$report.nextCursor
    if($next -and ($next -notmatch '^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$' -or $next -eq $cursor -or $batches -ge 20)){throw 'Invalid reconciliation pagination'}
    $cursor=$next
  }while($cursor)
  $success=$true
}finally{
  $summary=@{completed_utc=[DateTime]::UtcNow.ToString('o');action=$action;test_only=$true;success=$success;counts=$counts;batches=$batches;no_refunds_or_new_checkouts=$true}|ConvertTo-Json -Depth 5
  $prefix='tests/remediation/evidence/legacy-payment-operation-'+$action
  $summary|Set-Content -Encoding utf8 ($prefix+'-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')+'.json')
  $summary|Set-Content -Encoding utf8 ($prefix+'.json')
  if($payload){[Array]::Clear($payload,0,$payload.Length)}
  $settings=$null;$headers=$null;$token=$null;$cursor=$null;$json=$null;$report=$null
}
$counts|ConvertTo-Json
