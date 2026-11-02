# Read-only provider/database inspection through the operator-protected function.
# Uses only the locally generated worker token, decrypted in memory. No .env read.
$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
Add-Type -AssemblyName System.Security
$metadata=Get-Content -Raw tests/remediation/evidence/reservation-worker-settings.json|ConvertFrom-Json
if($metadata.project_ref -ne 'fathkdyxgeeokxeobxqp'){throw 'Unexpected worker settings project'}
$fileName=$metadata.generated_values_backup
if([IO.Path]::GetFileName($fileName) -ne $fileName -or $fileName -notmatch '^reservation-worker-settings-[0-9-]+\.dpapi$'){throw 'Invalid encrypted worker settings path'}
$privatePath=Join-Path '.private' $fileName
if((git check-ignore $privatePath.Replace('\','/')) -ne $privatePath.Replace('\','/')){throw 'Worker settings file must remain ignored'}
$payload=$null;$settings=$null;$token=$null;$headers=$null
try{
  $payload=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path (Get-Location) $privatePath)),[Text.Encoding]::UTF8.GetBytes('CebSpot reservation worker setup v1'),[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $settings=[Text.Encoding]::UTF8.GetString($payload)|ConvertFrom-Json
  $token=$settings.PAYMENT_WORKER_TOKEN
  if(-not $token -or $token.Length -lt 32){throw 'Generated worker token unavailable'}
  $headers=@{Authorization='Bearer '+$token}
  $offset=0;$scopeHash=$null;$scope=$null;$batches=0
  $counts=@{paidMatching=0;unpaidOpen=0;expired=0;referenceMismatch=0;amountOrCurrencyMismatch=0;modeMismatch=0;unexpectedStatus=0;cannotVerify=0}
  do{
    $url='https://fathkdyxgeeokxeobxqp.supabase.co/functions/v1/payment-reconciliation-report?offset='+$offset
    try{$response=Invoke-WebRequest -Uri $url -Method Get -Headers $headers -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 60}
    catch{throw 'Protected read-only report request failed. No financial changes were requested.'}
    if($response.StatusCode -ne 200){throw 'Read-only report returned an unsuccessful status'}
    try{$report=$response.Content|ConvertFrom-Json}catch{throw 'Malformed report response'}
    if($report.readOnly -ne $true -or $report.offset -ne $offset -or $report.scopeHash -notmatch '^[a-f0-9]{64}$'){throw 'Unexpected report contract'}
    if($null -eq $scopeHash){$scopeHash=$report.scopeHash;$scope=$report.scope}
    elseif($scopeHash -ne $report.scopeHash){throw 'Payment records changed during inspection; restart the read-only report'}
    foreach($key in @($counts.Keys)){
      $value=$report.checks.$key
      if($null -eq $value -or $value -isnot [ValueType] -or $value -lt 0 -or $value -gt 5 -or [double]$value -ne [Math]::Floor([double]$value)){throw 'Invalid aggregate report count'}
      $counts[$key]+=$value
    }
    $batches++
    $next=$report.nextOffset
    if($null -ne $next -and ($next -ne $offset+5 -or $next -gt 99 -or $batches -gt 20)){throw 'Invalid report pagination'}
    $offset=$next
  }while($null -ne $offset)
  $result=@{checked_utc=[DateTime]::UtcNow.ToString('o');read_only=$true;provider_mode='test';scope_hash=$scopeHash;scope=$scope;checks=$counts;batches=$batches;financial_writes_requested=$false;limitations='Provider lookup only. No payments, reservations or provider sessions were changed; live/unknown records skipped.'}
  $result|ConvertTo-Json -Depth 7|Set-Content -Encoding utf8 tests/remediation/evidence/legacy-payment-provider-inspection.json
  $counts|ConvertTo-Json
  if($counts.cannotVerify+$counts.referenceMismatch+$counts.amountOrCurrencyMismatch+$counts.modeMismatch+$counts.unexpectedStatus -gt 0){throw 'Some sessions remain unverified; aggregate evidence retained. No financial changes made.'}
}finally{
  if($payload){[Array]::Clear($payload,0,$payload.Length)}
  $settings=$null;$token=$null;$headers=$null
}
