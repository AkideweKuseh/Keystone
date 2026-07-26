#Requires -Version 5.1
<#
.SYNOPSIS
  Stops the Keystone stack on this branch PC. Data (Postgres/Redis/MinIO volumes)
  is preserved — use -Wipe only if you really want to delete it.
#>
[CmdletBinding()]
param(
  [string]$EnvFile,
  [switch]$Wipe   # also remove volumes (DESTROYS local data)
)

$ErrorActionPreference = 'Stop'
$RepoRoot    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ComposeFile = Join-Path $RepoRoot 'infra\compose\docker-compose.prod.yml'
if (-not $EnvFile) { $EnvFile = Join-Path $RepoRoot '.env.branch' }

$composeArgs = @('compose', '-f', $ComposeFile, '--env-file', $EnvFile, 'down', '--remove-orphans')
if ($Wipe) {
  Write-Host 'WARNING: -Wipe will delete Postgres/Redis/MinIO volumes for this branch.' -ForegroundColor Red
  $composeArgs += '--volumes'
}
& docker @composeArgs
if ($LASTEXITCODE -ne 0) { Write-Host 'docker compose down failed (see output above).' -ForegroundColor Red; exit 1 }
Write-Host 'Keystone stopped.' -ForegroundColor Green
