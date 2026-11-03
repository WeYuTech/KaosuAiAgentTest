param([switch]$DryRun)
function Step([string]$message){Write-Output (('[{0}] ' -f $(if($DryRun){'空跑'}else{'執行'}))+$message)}
function ProxyValues {
 $values=[ordered]@{}
 foreach($name in @('enabled','responseBufferLimit','minResponseBuffer','bufferChunkedResponses','preserveHostHeader','timeout')){
  $values[$name]=[string](Get-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name $name).Value
 }
 return ($values|ConvertTo-Json -Compress)
}
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root='C:\Services\KaosuAiAgent'
$release='kaosu-issue51-93ad0c2-20261103-seventh'
$current=Join-Path $root 'current'
$stage=Join-Path $root "staging\$release"
$backup=Join-Path $root "backups\code-before-$release"
$zip=Join-Path $root 'kaosu-issue51-93ad0c2-20261103-seventh.zip'
foreach($target in @($current,$stage,$backup)) {
 if(![IO.Path]::GetFullPath($target).StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){throw '路徑越界'}
}
if((Test-Path -LiteralPath $backup) -or (Test-Path -LiteralPath $stage)){throw '備份或暫存已存在，拒絕覆寫'}
if((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne '78a41d576dcdc235c1bb91a4fe99c4d7eb679c1e6423ceb51d08fdaa453d8d8e'){throw '發行ZIP校驗失敗'}
Step '01 核對 ZIP；將解壓至新的 staging 目錄'
if($DryRun){$stage=Join-Path $root 'staging\kaosu-issue51-93ad0c2-20261103-seventh-preflight'}else{Expand-Archive -LiteralPath $zip -DestinationPath $stage}
$entries=@()
foreach($line in Get-Content -LiteralPath "$stage\SHA256SUMS.txt" -Encoding UTF8){
 $p=$line -split '  ',2
 $source=[IO.Path]::GetFullPath((Join-Path $stage $p[1]))
 if(!$source.StartsWith($stage+'\',[StringComparison]::OrdinalIgnoreCase) -or $p[1] -match '(^|/)(\.env|\.local)(/|$)'){throw '發行路徑不合法'}
 if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $p[0]){throw '逐檔來源校驗失敗'}
 $entries+=@{path=$p[1];hash=$p[0];existed=(Test-Path -LiteralPath (Join-Path $current $p[1]))}
}
if((Get-FileHash "$stage\requirements.lock.txt").Hash -ne (Get-FileHash "$current\requirements.lock.txt").Hash){throw '依賴異動，需要另行驗證'}
Step ('02 來源逐檔與依賴核對通過：'+$entries.Count+' 檔')
$task=Get-ScheduledTask -TaskName KaosuAiAgent
if($task.Principal.UserId -ne 'LOCAL SERVICE'){throw '服務身分不符'}
$listener=Get-NetTCPConnection -LocalPort 8765 -State Listen
if($listener.LocalAddress -ne '127.0.0.1'){throw '非loopback監聽'}
$oldPid=$listener.OwningProcess
Step '03 核對工作身分及 loopback；將建立唯一備份並限制 ACL'
if(!$DryRun){
 New-Item -ItemType Directory -Path "$backup\private" -Force | Out-Null
 & icacls $backup /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
 if($LASTEXITCODE -ne 0){throw '備份存取權設定失敗'}
}
& "$root\venv\Scripts\python.exe" "$root\issue29-deploy-state.py"
if($LASTEXITCODE -ne 0){throw '有進行中作業，暫停部署'}
Import-Module WebAdministration
$globalProxyValues=ProxyValues
$oldBuffer=(Get-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name responseBufferLimit).Value
if($oldBuffer -ne 4096){throw '代理設定已改變，停止部署'}
if((Get-FileHash "$root\proxy\web.config").Hash -ne 'D72414F7FB03F459D6E4CDC0E8F3C2F86CDA79CF73CB8BE2E6105A79DA704B19'){throw '代理檔已改變'}
Step ('04 全域 proxy 逐項唯讀核對：'+$globalProxyValues)
Step '05 將建立新的 IIS 備份及代理 web.config 備份'
if(!$DryRun){
 & "$env:windir\system32\inetsrv\appcmd.exe" add backup 'KaosuAiAgent-issue51-20261103-seventh' | Out-Null
 if($LASTEXITCODE -ne 0){throw 'IIS備份失敗'}
 Copy-Item -LiteralPath "$root\proxy\web.config" -Destination "$backup\proxy-web.config"
}
$stopped=$false
try {
 Step '06 將只停止助理工作並等待 loopback 監聽釋放'
 if(!$DryRun){
  Stop-ScheduledTask -TaskName KaosuAiAgent
  $stopped=$true
  for($i=0;$i -lt 20;$i++){if(!(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue)){break};Start-Sleep -Seconds 1}
  if(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue){throw '助理尚未停止，拒絕覆寫'}
 }
 Step '07 完整備份非日誌檔；日誌另存快照且回復時不覆蓋'
 $fullCount=0;$logSnapshots=@()
 foreach($file in Get-ChildItem -LiteralPath $current -Recurse -File){
  $rel=$file.FullName.Substring($current.Length+1)
  if($rel.StartsWith('.local\logs\',[StringComparison]::OrdinalIgnoreCase)){
   # 日誌是會變動的操作紀錄，不列入逐位元組還原清單。
   # 共享讀取產生單次快照；空跑只在記憶體讀取，不寫入任何備份。
   $inputStream=[IO.File]::Open($file.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
   $memory=New-Object IO.MemoryStream
   try{$inputStream.CopyTo($memory);$bytes=$memory.ToArray()}finally{$inputStream.Dispose();$memory.Dispose()}
   $sha=[Security.Cryptography.SHA256]::Create()
   try{$digest=[BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','')}finally{$sha.Dispose()}
   $saved=Join-Path "$backup\log-snapshots" $rel
   if(!$DryRun){New-Item -ItemType Directory -Force (Split-Path $saved)|Out-Null;[IO.File]::WriteAllBytes($saved,$bytes);if((Get-FileHash -LiteralPath $saved).Hash -ne $digest){throw '日誌快照校驗失敗'}}
   $logSnapshots+=@{path=$rel;bytes=$bytes.Length;sha256=$digest;snapshot_utc=[DateTime]::UtcNow.ToString('o');restore=$false}
   continue
  }
  $hash=(Get-FileHash -LiteralPath $file.FullName).Hash
  if(!$DryRun){
   $saved=Join-Path "$backup\full-current" $rel
   New-Item -ItemType Directory -Force (Split-Path $saved)|Out-Null
   Copy-Item -LiteralPath $file.FullName -Destination $saved
   if((Get-FileHash -LiteralPath $saved).Hash -ne $hash){throw '完整備份校驗失敗'}
  }
  $fullCount++
 }
 Step ('非日誌完整備份來源：'+$fullCount+' 檔；日誌快照：'+$logSnapshots.Count+' 檔')
 $privateHashes=@{}
 foreach($path in @('.env','.local\operations.db','.local\model-budget.db')){
  $privateHashes[$path]=(Get-FileHash -LiteralPath (Join-Path $current $path)).Hash
  $saved=Join-Path "$backup\private" $path
  if(!$DryRun){New-Item -ItemType Directory -Force (Split-Path $saved) | Out-Null
  Copy-Item -LiteralPath (Join-Path $current $path) -Destination $saved}
 }
 Step '08 將備份私密設定、資料庫、sidecar、舊檔與清單；不還原或重設資料'
 foreach($sidecar in Get-ChildItem -LiteralPath "$current\.local" -File | Where-Object {$_.Name -match '\.db-(wal|shm|journal)$'}) {if(!$DryRun){Copy-Item -LiteralPath $sidecar.FullName -Destination "$backup\private\.local"}}
 foreach($entry in $entries){if($entry.existed){
  $saved=Join-Path $backup $entry.path
  if(!$DryRun){New-Item -ItemType Directory -Force (Split-Path $saved) | Out-Null;Copy-Item -LiteralPath (Join-Path $current $entry.path) -Destination $saved}
 }}
 if(!$DryRun){Copy-Item -LiteralPath "$current\SHA256SUMS.txt" -Destination "$backup\SHA256SUMS.txt"}
 if((ProxyValues) -ne $globalProxyValues){throw '全域 proxy 設定發生異動'}
 $metadata=@{release=$release;commit='93ad0c28853f3b6b939ef2e52f46a600f0321dcd';created_utc=[DateTime]::UtcNow.ToString('o');changes=$entries;old_responseBufferLimit=$oldBuffer;global_proxy_values=($globalProxyValues|ConvertFrom-Json);private_sha256=$privateHashes;full_backup='full-current';full_backup_count=$fullCount;log_snapshots=$logSnapshots;log_policy='日誌另存複製當下快照，不在回復清單，不以舊日誌覆蓋新日誌';iis_backup='KaosuAiAgent-issue51-20261103-seventh';rollback='停止專屬助理，還原程式與清單；保留目前.env與.local，不以舊資料庫覆蓋新紀錄。'}
 Step '09 將寫入 deployment.json 與部署／回復腳本'
 $metadataJson=$metadata|ConvertTo-Json -Depth 6
 if(!$DryRun){$metadataJson|Set-Content "$backup\deployment.json" -Encoding UTF8}
 if(!$DryRun){Copy-Item -LiteralPath "$root\rollback-issue51-seventh.ps1" -Destination "$backup\rollback.ps1"}
 if(!$DryRun){Copy-Item -LiteralPath "$root\deploy-issue51-seventh.ps1" -Destination "$backup\deploy.ps1"}
 Step '10 將逐檔部署，保留舊雜湊資產，最後原子替換 HTML'
 foreach($entry in ($entries | Sort-Object @{Expression={if($_.path -eq 'frontend/dist/index.html'){2}elseif($_.path -eq 'frontend/dist/widget-loader.js'){1}else{0}}})){
  $target=[IO.Path]::GetFullPath((Join-Path $current $entry.path))
  if(!$target.StartsWith($current+'\',[StringComparison]::OrdinalIgnoreCase)){throw '目標路徑越界'}
  if($DryRun){Step ('將複製：'+$entry.path);continue}
  New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
  if($entry.path -eq 'frontend/dist/index.html'){$tmp=$target+'.issue51-new';Copy-Item -LiteralPath (Join-Path $stage $entry.path) -Destination $tmp;[IO.File]::Replace($tmp,$target,(Join-Path $backup ("replaced-index-"+[guid]::NewGuid().ToString()+".html")))}else{Copy-Item -LiteralPath (Join-Path $stage $entry.path) -Destination $target -Force}
 }
 Step '11 將更新清單並校驗部署檔；空跑校驗發行來源'
 if(!$DryRun){Copy-Item -LiteralPath "$stage\SHA256SUMS.txt" -Destination "$current\SHA256SUMS.txt" -Force}
 $verifyRoot=if($DryRun){$stage}else{$current}
 foreach($entry in $entries){if((Get-FileHash -LiteralPath (Join-Path $verifyRoot $entry.path)).Hash -ne $entry.hash){throw '發行檔校驗失敗'}}
 foreach($path in $privateHashes.Keys){if((Get-FileHash -LiteralPath (Join-Path $current $path)).Hash -ne $privateHashes[$path]){throw '設定或帳本遭變更'}}
 [xml]$proxyXml=Get-Content "$root\proxy\web.config" -Raw
 $section=$proxyXml.configuration.'system.webServer'
 $node=$section.SelectSingleNode('urlCompression');if(!$node){$node=$proxyXml.CreateElement('urlCompression');[void]$section.AppendChild($node)}
 $node.SetAttribute('doDynamicCompression','false')
 Step '12 代理 XML 於記憶體設定動態壓縮 false；將原子替換專用 web.config'
 if(!$DryRun){$proxyXml.Save("$root\proxy\web.config.new")
 [IO.File]::Replace("$root\proxy\web.config.new","$root\proxy\web.config",(Join-Path $backup ("replaced-proxy-"+[guid]::NewGuid().ToString()+".config")))}
 Step '13 將啟動助理；核對健康與全域 proxy 未變更'
 if(!$DryRun){Start-ScheduledTask -TaskName KaosuAiAgent}
 $health=$null
 for($i=0;$i -lt 30;$i++){try{$health=Invoke-RestMethod 'http://127.0.0.1/KSS_MES/ai-agent/api/health';if($health.status -eq 'ok' -and $health.mode -eq 'live'){break}}catch{};Start-Sleep -Seconds 1}
 if(!$health -or $health.status -ne 'ok' -or $health.mode -ne 'live'){throw '重啟健康檢查失敗'}
 if((ProxyValues) -ne $globalProxyValues){throw '全域 proxy 設定發生異動'}
 $listener=Get-NetTCPConnection -LocalPort 8765 -State Listen
 if($listener.LocalAddress -ne '127.0.0.1'){throw '重啟後監聽位置錯誤'}
 $result=@{release=$release;commit='93ad0c28853f3b6b939ef2e52f46a600f0321dcd';verified=$entries.Count;old_responseBufferLimit=$oldBuffer;new_responseBufferLimit=$oldBuffer;global_proxy_unchanged=((ProxyValues) -eq $globalProxyValues);dynamic_compression=$false;backup=$backup;private_settings_and_databases_preserved=$true;service_restarted=($oldPid -ne $listener.OwningProcess);listen=$listener.LocalAddress;health=$health;dry_run=[bool]$DryRun}
 $result|ConvertTo-Json -Depth 6
 if(!$DryRun){$result|ConvertTo-Json -Depth 6|Set-Content "$root\deployment-$release.json" -Encoding UTF8}
 Step '14 全部階段完成'
 } catch {
 $failure=$_.Exception.Message
 if(!$DryRun -and (Test-Path -LiteralPath "$backup\deployment.json")){
   & "$root\rollback-issue51-seventh.ps1"
 }elseif($stopped){Start-ScheduledTask -TaskName KaosuAiAgent}
 if($DryRun){throw "空跑失敗，未變更正式檔案：$failure"}
 throw "部署未完成，回復處理詳見前述輸出：$failure"
}
