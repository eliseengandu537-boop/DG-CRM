$ErrorActionPreference = "SilentlyContinue"

$projectRoot = Split-Path -Parent $PSScriptRoot
$frontendPath = Join-Path $projectRoot "frontend"
$frontendPattern = [regex]::Escape($frontendPath)

# Kill stale Next.js processes for this frontend only.
Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq "node.exe" -and
    $_.CommandLine -match $frontendPattern -and
    $_.CommandLine -match "next"
  } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# Remove stale build cache to avoid corrupted HMR/build state.
if (Test-Path (Join-Path $frontendPath ".next")) {
  Remove-Item (Join-Path $frontendPath ".next") -Recurse -Force
}

Set-Location $frontendPath
npm run dev:next
