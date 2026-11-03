# 於已安裝 Python、URL Rewrite、ARR 的 MES 主機，以管理員執行。
# 後端程式與 .env 必須先放妥；本腳本不填入或輸出憑證。
param([string]$Root='C:\Services\KaosuAiAgent', [string]$Site='Default Web Site')
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Import-Module WebAdministration
if (!(Test-Path "$Root\venv\Scripts\pythonw.exe") -or !(Test-Path "$Root\current\.env")) { throw '缺少執行環境或私密設定' }
foreach($name in @('RewriteModule','ApplicationRequestRouting')) {
    if (!(Get-WebGlobalModule -Name $name -ErrorAction SilentlyContinue)) { throw "缺少 IIS 模組：$name" }
}
$mes=Get-WebApplication -Site $Site | Where-Object path -eq '/KSS_MES'
if (!$mes) { throw '找不到原 KSS_MES 應用程式' }
$bridgeSource=Join-Path $Root 'current\scripts\mes_session_bridge.ashx'
$bridgeTarget=Join-Path $mes.PhysicalPath 'AiAgentSession.ashx'
if (!(Test-Path -LiteralPath $bridgeSource)) { throw '缺少原 MES 身分橋接程式' }
if (Test-Path -LiteralPath $bridgeTarget) {
    if ((Get-FileHash $bridgeSource).Hash -ne (Get-FileHash $bridgeTarget).Hash) { throw '身分橋接路徑已有不同檔案，需先核對與備份' }
} else { Copy-Item -LiteralPath $bridgeSource -Destination $bridgeTarget }
$proxy=Join-Path $Root 'proxy'
New-Item -ItemType Directory -Force $proxy | Out-Null
# proxy 只有反向代理設定，不放後端程式、環境設定或資料庫。
$config=@'
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite><rules><clear/>
      <rule name="KaosuAiAgent" stopProcessing="true">
        <match url="(.*)"/>
        <action type="Rewrite" url="http://127.0.0.1:8765/{R:1}" appendQueryString="true"/>
      </rule>
    </rules></rewrite>
    <httpErrors existingResponse="PassThrough"/>
    <directoryBrowse enabled="false"/>
    <caching enabled="false" enableKernelCache="false"/>
    <urlCompression doDynamicCompression="false"/>
  </system.webServer>
</configuration>
'@
[IO.File]::WriteAllText("$proxy\web.config",$config,[Text.UTF8Encoding]::new($false))
icacls $proxy /grant '*S-1-5-32-568:(OI)(CI)RX' | Out-Null
if($LASTEXITCODE -ne 0) { throw 'IIS 代理目錄權限設定失敗' }
$pool='KaosuAiAgentProxy'
if (!(Test-Path "IIS:\AppPools\$pool")) { New-WebAppPool -Name $pool | Out-Null }
Set-ItemProperty "IIS:\AppPools\$pool" -Name managedRuntimeVersion -Value ''
$existing=Get-WebApplication -Site $Site | Where-Object path -eq '/KSS_MES/ai-agent'
if ($existing -and $existing.PhysicalPath -ne $proxy) { throw '目標 IIS 路徑已有其他應用程式，停止覆寫' }
if (!$existing) { New-WebApplication -Site $Site -Name 'KSS_MES/ai-agent' -PhysicalPath $proxy -ApplicationPool $pool | Out-Null }
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name enabled -Value $true
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name preserveHostHeader -Value $true
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name timeout -Value '00:05:00'
# ARR 伺服器層級緩衝必須關閉；代理應用停用動態壓縮以保持 SSE 即時傳送。
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name responseBufferLimit -Value 0
$action=New-ScheduledTaskAction -Execute "$Root\venv\Scripts\pythonw.exe" -Argument "`"$Root\current\scripts\run_service.py`"" -WorkingDirectory "$Root\current"
$principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount
$settings=New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'KaosuAiAgent' -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $principal -Settings $settings -Description 'MES 生產作業助理；本機 IIS 轉送，LOCAL SERVICE 執行' -Force | Out-Null
Start-ScheduledTask -TaskName 'KaosuAiAgent'
'IIS 入口與開機啟動已設定，請驗證 /KSS_MES/ai-agent/api/health'
