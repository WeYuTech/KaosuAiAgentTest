param([switch]$DryRun)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
function Step([string]$message){Write-Output (('[{0}] ' -f $(if($DryRun){'回復空跑'}else{'回復'}))+$message)}
$root='C:\Services\KaosuAiAgent';$current="$root\current";$backup="$root\backups\code-before-kaosu-issue47-6ff9ec8-20261103-fifth"
# 回復僅依發行清單還原程式；不讀取 log-snapshots、不覆蓋任何 .local 日誌。
Import-Module WebAdministration
function ProxyValues {
 $values=[ordered]@{}
 foreach($name in @('enabled','responseBufferLimit','minResponseBuffer','bufferChunkedResponses','preserveHostHeader','timeout')){$values[$name]=[string](Get-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name $name).Value}
 return ($values|ConvertTo-Json -Compress)
}
$proxyBefore=ProxyValues
Step ('01 逐項讀取全域 proxy，不寫入：'+$proxyBefore)
if($DryRun){
 $changes=@()
 foreach($line in Get-Content "$root\staging\kaosu-issue47-6ff9ec8-20261103-third\SHA256SUMS.txt" -Encoding UTF8){$p=$line -split '  ',2;$changes+=@{path=$p[1];existed=(Test-Path -LiteralPath (Join-Path $current $p[1]))}}
 $d=@{changes=$changes};$savedRoot=$current;$manifestSource="$current\SHA256SUMS.txt";$proxySource="$root\proxy\web.config"
 Step '02 空跑以目前原版本作為將備份來源；完整讀取待還原檔案'
}else{
 $d=Get-Content "$backup\deployment.json" -Raw -Encoding UTF8|ConvertFrom-Json
 if(!(Test-Path -LiteralPath "$backup\full-current") -or !(Test-Path -LiteralPath "$backup\SHA256SUMS.txt")){throw '完整備份不存在，拒絕停止服務'}
 $savedRoot=$backup;$manifestSource="$backup\SHA256SUMS.txt";$proxySource="$backup\proxy-web.config"
}
$sourceHashes=@{}
foreach($e in $d.changes){
 $target=[IO.Path]::GetFullPath((Join-Path $current $e.path))
 if(!$target.StartsWith($current+'\',[StringComparison]::OrdinalIgnoreCase) -or $e.path -match '(^|/)(\.env|\.local)(/|$)'){throw '回復路徑不合法'}
 if($e.existed){$sourceHashes[$e.path]=(Get-FileHash -LiteralPath (Join-Path $savedRoot $e.path)).Hash}
}
$manifestHash=(Get-FileHash -LiteralPath $manifestSource).Hash
$proxyHash=(Get-FileHash -LiteralPath $proxySource).Hash
[xml]$xml=Get-Content -LiteralPath $proxySource -Raw
Step '03 將只停止助理，等待監聽釋放；不停止 MES 或 IIS'
if(!$DryRun){
 Stop-ScheduledTask -TaskName KaosuAiAgent
 for($i=0;$i -lt 20;$i++){if(!(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue)){break};Start-Sleep -Seconds 1}
 if(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue){throw '服務尚未停止，不回復'}
}
$privateBefore=@{};foreach($name in @('.env','.local\operations.db','.local\model-budget.db')){$privateBefore[$name]=(Get-FileHash -LiteralPath (Join-Path $current $name)).Hash}
Step '04 將回復舊程式；HTML 最後原子替換，備份路徑使用 GUID'
foreach($e in ($d.changes|Sort-Object @{Expression={if($_.path -eq 'frontend/dist/index.html'){1}else{0}}})){
 $target=Join-Path $current $e.path
 if($e.existed){
  if($DryRun){Step ('將還原：'+$e.path);continue}
  if($e.path -eq 'frontend/dist/index.html'){$tmp=$target+'.rollback';Copy-Item -LiteralPath (Join-Path $savedRoot $e.path) -Destination $tmp;[IO.File]::Replace($tmp,$target,(Join-Path $backup ('rollback-index-'+[guid]::NewGuid().ToString()+'.html')))}else{Copy-Item -LiteralPath (Join-Path $savedRoot $e.path) -Destination $target -Force}
 }
}
Step '05 將移除新增非雜湊資產檔；保留舊／新雜湊資產'
foreach($e in $d.changes){if(!$e.existed -and $e.path -notlike 'frontend/dist/assets/*'){
 $target=[IO.Path]::GetFullPath((Join-Path $current $e.path))
 if(!$target.StartsWith($current+'\',[StringComparison]::OrdinalIgnoreCase) -or $e.path -match '(^|/)(\.env|\.local)(/|$)'){throw '清理路徑不合法'}
 if($DryRun){Step ('將清理新增檔：'+$e.path)}elseif(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target}
}}
Step '06 將回復原清單及代理檔；全域 proxy 完全不動'
if(!$DryRun){
 Copy-Item -LiteralPath $manifestSource -Destination "$current\SHA256SUMS.txt" -Force
 Copy-Item -LiteralPath $proxySource -Destination "$root\proxy\web.config.rollback"
 [IO.File]::Replace("$root\proxy\web.config.rollback","$root\proxy\web.config",(Join-Path $backup ('rollback-proxy-'+[guid]::NewGuid().ToString()+'.config')))
}
Step '07 核對原檔、清單、代理、私密資料未遭回復覆蓋'
foreach($name in $sourceHashes.Keys){if((Get-FileHash -LiteralPath (Join-Path $current $name)).Hash -ne $sourceHashes[$name]){throw '回復檔案不符'}}
if((Get-FileHash "$current\SHA256SUMS.txt").Hash -ne $manifestHash -or (Get-FileHash "$root\proxy\web.config").Hash -ne $proxyHash){throw '回復清單或代理不符'}
foreach($name in $privateBefore.Keys){if((Get-FileHash -LiteralPath (Join-Path $current $name)).Hash -ne $privateBefore[$name]){throw '私密資料異動'}}
if((ProxyValues) -ne $proxyBefore){throw '全域 proxy 異動'}
Step '08 將啟動助理並核對健康'
if(!$DryRun){Start-ScheduledTask -TaskName KaosuAiAgent}
$health=$null
for($i=0;$i -lt 30;$i++){try{$health=Invoke-RestMethod 'http://127.0.0.1/KSS_MES/ai-agent/api/health';if($health.status -eq 'ok'){break}}catch{};Start-Sleep -Seconds 1}
if(!$health -or $health.status -ne 'ok'){throw '回復健康檢查失敗'}
@{dry_run=[bool]$DryRun;verified_original_files=$sourceHashes.Count;global_proxy_unchanged=$true;private_preserved=$true;health=$health}|ConvertTo-Json -Depth 5
Step '09 全部回復階段完成'
