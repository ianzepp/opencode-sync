[CmdletBinding()]
param(
  [ValidateSet('start', 'stop', 'restart', 'install-task', 'remove-task')]
  [string]$Action = 'start',
  [string]$Port = '3000'
)

$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$distCli = Join-Path $projectDir 'dist\cli.js'
$pidFile = Join-Path $projectDir '.opencode-sync-webui.pid'
$logDir = Join-Path $projectDir 'logs'
$stdoutLog = Join-Path $logDir 'webui.stdout.log'
$stderrLog = Join-Path $logDir 'webui.stderr.log'
$taskName = 'opencode-sync-webui'
$scriptPath = Join-Path $projectDir 'webui.ps1'
$cliMarker = [System.IO.Path]::GetFullPath($distCli).Replace('/', '\').ToLowerInvariant()

# Startup configuration. Existing process environment variables take precedence;
# these defaults make the scheduled task self-contained when they are absent.
$startupStorageDir = if ([string]::IsNullOrWhiteSpace($env:OPENCODE_STORAGE_DIR)) {
  Join-Path $env:USERPROFILE '.local\share\opencode\storage'
} else {
  $env:OPENCODE_STORAGE_DIR
}
$startupSyncDir = if ([string]::IsNullOrWhiteSpace($env:OPENCODE_SYNC_DIR)) {
  Join-Path $env:USERPROFILE 'opencode-sync-data'
} else {
  $env:OPENCODE_SYNC_DIR
}
$startupCodexHome = if ([string]::IsNullOrWhiteSpace($env:CODEX_HOME)) {
  Join-Path $env:USERPROFILE '.codex'
} else {
  $env:CODEX_HOME
}

$env:OPENCODE_STORAGE_DIR = $startupStorageDir
$env:OPENCODE_SYNC_DIR = $startupSyncDir
$env:CODEX_HOME = $startupCodexHome

function Get-ManagedWebProcess {
  if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf)) {
    return $null
  }

  $rawId = (Get-Content -LiteralPath $pidFile -Raw).Trim()
  if ($rawId -notmatch '^\d+$') {
    return $null
  }

  $processId = [int]$rawId
  $candidate = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
  if (-not $candidate -or -not $candidate.CommandLine) {
    return $null
  }

  $commandLine = ($candidate.CommandLine -replace '/', '\').ToLowerInvariant()
  if ($commandLine.Contains($cliMarker)) {
    return $candidate
  }

  return $null
}

function Remove-PidFile {
  if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
    Remove-Item -LiteralPath $pidFile -Force
  }
}

function Build-Project {
  Push-Location -LiteralPath $projectDir
  try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
      throw "Build failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

function Start-WebUi {
  if (-not (Test-Path -LiteralPath $distCli -PathType Leaf)) {
    throw "Built CLI not found: $distCli. Run npm.cmd run build first."
  }

  $managedProcess = Get-ManagedWebProcess
  if ($managedProcess) {
    Write-Output "OpenCode Sync Web UI is already running (PID $($managedProcess.ProcessId))."
    return
  }

  Remove-PidFile
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null

  $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
  $cliArgument = '"' + $distCli + '"'
  $webProcess = Start-Process `
    -FilePath $nodePath `
    -ArgumentList @($cliArgument, 'serve', '--port', $Port) `
    -WorkingDirectory $projectDir `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -LiteralPath $pidFile -Value $webProcess.Id -NoNewline
  Write-Output "OpenCode Sync Web UI started (PID $($webProcess.Id), port $Port)."
  Write-Output "Logs: $stdoutLog and $stderrLog"
}

function Stop-WebUi {
  $managedProcess = Get-ManagedWebProcess
  if ($managedProcess) {
    Stop-Process -Id ([int]$managedProcess.ProcessId) -Force
    Write-Output "OpenCode Sync Web UI stopped (PID $($managedProcess.ProcessId))."
  } else {
    Write-Output 'OpenCode Sync Web UI is not running or its PID file is stale.'
  }

  Remove-PidFile
}

function Install-StartupTask {
  $userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $taskArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -Action start -Port $Port"
  $taskAction = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument $taskArguments
  $taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
  $taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable

  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $taskAction `
    -Trigger $taskTrigger `
    -Principal $taskPrincipal `
    -Settings $taskSettings `
    -Description 'Start the OpenCode Sync Web UI at user logon.' `
    -Force | Out-Null

  Write-Output "Startup task '$taskName' has been registered for $userId."
  Write-Output "It will use the user's OPENCODE_* and CODEX_HOME environment variables."
}

function Remove-StartupTask {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "Startup task '$taskName' has been removed if it existed."
}

switch ($Action) {
  'start' { Start-WebUi }
  'stop' { Stop-WebUi }
  'restart' {
    Build-Project
    Stop-WebUi
    Start-WebUi
  }
  'install-task' { Install-StartupTask }
  'remove-task' { Remove-StartupTask }
}
