$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $projectRoot "backend"
$backendPattern = [regex]::Escape($backendPath)
$schemaPath = Join-Path $backendPath "prisma\schema.prisma"
$prismaClientPath = Join-Path $backendPath "node_modules\.prisma\client"
$schemaHashPath = Join-Path $prismaClientPath ".schema-hash"

function Get-FileSha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      $hashBytes = $sha256.ComputeHash($stream)
    } finally {
      $sha256.Dispose()
    }
  } finally {
    $stream.Dispose()
  }

  return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
}

function Get-SchemaHash {
  return Get-FileSha256 -Path $schemaPath
}

function Stop-StaleBackendProcesses {
  try {
    Get-CimInstance Win32_Process |
      Where-Object {
        $_.Name -eq "node.exe" -and
        $_.CommandLine -match $backendPattern -and
        (
          $_.CommandLine -match "ts-node" -or
          $_.CommandLine -match "src\\server.ts" -or
          $_.CommandLine -match "dist\\server.js" -or
          $_.CommandLine -match "prisma"
        )
      } |
      ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      }
  } catch {
    Write-Warning "Could not inspect existing backend Node processes: $($_.Exception.Message)"
  }
}

function Remove-StalePrismaTempFiles {
  if (-not (Test-Path $prismaClientPath)) {
    return
  }

  Get-ChildItem -Path $prismaClientPath -Filter "query_engine-windows.dll.node.tmp*" -Force -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

function Test-PrismaClientCurrent {
  if (-not (Test-Path $prismaClientPath)) {
    return $false
  }

  $requiredFiles = @(
    "index.js",
    "index.d.ts",
    "package.json",
    "query_engine-windows.dll.node",
    "schema.prisma"
  )

  foreach ($file in $requiredFiles) {
    if (-not (Test-Path (Join-Path $prismaClientPath $file))) {
      return $false
    }
  }

  if (Get-ChildItem -Path $prismaClientPath -Filter "query_engine-windows.dll.node.tmp*" -Force -ErrorAction SilentlyContinue | Select-Object -First 1) {
    return $false
  }

  if (-not (Test-Path $schemaHashPath)) {
    return $false
  }

  $storedHash = (Get-Content -Path $schemaHashPath -Raw).Trim().ToLowerInvariant()
  $currentHash = Get-SchemaHash

  return $storedHash -eq $currentHash
}

function Save-SchemaHash {
  $schemaHash = Get-SchemaHash
  if (-not (Test-Path $prismaClientPath)) {
    New-Item -ItemType Directory -Path $prismaClientPath -Force | Out-Null
  }

  Set-Content -Path $schemaHashPath -Value $schemaHash -NoNewline
}

function Invoke-PrismaGenerate {
  $maxAttempts = 4

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    Remove-StalePrismaTempFiles
    Write-Host "Ensuring Prisma client matches schema (attempt $attempt/$maxAttempts)..."

    & npm run prisma:generate
    if ($LASTEXITCODE -eq 0) {
      Remove-StalePrismaTempFiles
      Save-SchemaHash
      return
    }

    if ($attempt -eq $maxAttempts) {
      throw "Prisma client generation failed after $maxAttempts attempts."
    }

    Write-Warning "Prisma generate failed. Retrying after clearing stale backend processes..."
    Stop-StaleBackendProcesses
    Start-Sleep -Seconds ([Math]::Min($attempt * 2, 6))
  }
}

Set-Location $backendPath
Stop-StaleBackendProcesses

if (Test-PrismaClientCurrent) {
  Write-Host "Prisma client already matches schema."
} else {
  Invoke-PrismaGenerate
}

if ($env:SKIP_BACKEND_SERVER_START -eq "1") {
  Write-Host "Backend server start skipped."
  exit 0
}

& npm run dev:server
exit $LASTEXITCODE
