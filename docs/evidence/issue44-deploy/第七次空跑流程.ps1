$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$root='C:\Services\KaosuAiAgent'
$log="$root\issue51-seventh-dryrun.log"
if(Test-Path -LiteralPath $log){throw '空跑紀錄已存在，拒絕重試'}
$before=@{}
foreach($p in @('current\.env','current\.local\operations.db','current\.local\model-budget.db','current\frontend\dist\index.html','proxy\web.config')){$before[$p]=(Get-FileHash -LiteralPath (Join-Path $root $p)).Hash}
$pidBefore=(Get-NetTCPConnection -LocalPort 8765 -State Listen).OwningProcess
try {
 & "$root\deploy-issue51-seventh.ps1" -DryRun | Tee-Object -FilePath $log
 & "$root\rollback-issue51-seventh.ps1" -DryRun | Tee-Object -FilePath $log -Append
 foreach($p in $before.Keys){if((Get-FileHash -LiteralPath (Join-Path $root $p)).Hash -ne $before[$p]){throw '空跑前後檔案雜湊異動'}}
 if((Get-NetTCPConnection -LocalPort 8765 -State Listen).OwningProcess -ne $pidBefore){throw '空跑期間服務程序異動'}
 @{passed=$true;powershell=$PSVersionTable.PSVersion.ToString();both_scripts_completed=$true;private_and_html_proxy_hashes_unchanged=$true;service_process_unchanged=$true;checked_utc=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Tee-Object -FilePath "$root\issue51-seventh-dryrun-result.json"
}catch{('空跑失敗：'+$_.Exception.Message)|Add-Content -LiteralPath $log;throw}