$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $projectRoot "backend"
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

if (-not (Test-Path $prismaClientPath)) {
  exit 0
}

$schemaHash = Get-FileSha256 -Path $schemaPath
Set-Content -Path $schemaHashPath -Value $schemaHash -NoNewline
