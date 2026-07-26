#Requires -Version 5.1
<#
.SYNOPSIS
  One-click Keystone launcher for a branch PC. Brings up the full Docker stack
  (Postgres, Redis, MinIO, api, worker, receiver, dashboard) and opens the
  dashboard. Safe to re-run; it just reconciles the running stack.

.NOTES
  Config comes from a per-branch env file (default: .env.branch at the repo
  root). Copy .env.branch.example to .env.branch and fill it in first.
#>
[CmdletBinding()]
param(
  [string]$EnvFile,
  [switch]$Rebuild,          # force a rebuild of the images
  [switch]$NoBrowser         # don't open the dashboard when healthy
)

$ErrorActionPreference = 'Stop'

# Repo root = two levels up from infra/launcher/
$RepoRoot   = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ComposeFile = Join-Path $RepoRoot 'infra\compose\docker-compose.prod.yml'
if (-not $EnvFile) { $EnvFile = Join-Path $RepoRoot '.env.branch' }

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }
function Fail($msg)       { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# ── 1. Docker present and running ─────────────────────────────────────────────
Write-Step 'Checking Docker'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail 'Docker is not installed or not on PATH. Install Docker Desktop / Engine and retry.'
}
try { docker info *> $null } catch { Fail 'Docker is installed but not running. Start Docker and retry.' }
Write-Ok 'Docker is running.'

# ── 2. Config file present ────────────────────────────────────────────────────
Write-Step "Checking config: $EnvFile"
if (-not (Test-Path $EnvFile)) {
  $example = Join-Path $RepoRoot '.env.branch.example'
  if (Test-Path $example) {
    Copy-Item $example $EnvFile
    Write-Warn "No branch config found — created $EnvFile from the template."
    Fail 'Open that file, fill in BRANCH_ID and the secrets, then run this again.'
  }
  Fail "Config file not found and no template to copy: $EnvFile"
}
if (Select-String -Path $EnvFile -Pattern 'CHANGE_ME' -Quiet) {
  Write-Warn "$EnvFile still contains CHANGE_ME placeholders."
  Write-Warn 'Fill in real values before a production deployment (continuing anyway).'
}

# Parse the ports we need to probe/open (default to the prod compose defaults).
function Get-EnvValue($name, $default) {
  $line = Select-String -Path $EnvFile -Pattern "^\s*$name\s*=" | Select-Object -First 1
  if ($line) { return ($line.Line -replace "^\s*$name\s*=\s*", '').Trim() }
  return $default
}
$apiPort       = Get-EnvValue 'API_PORT' '4001'
$dashboardPort = Get-EnvValue 'DASHBOARD_PORT' '3002'
$branchId      = Get-EnvValue 'BRANCH_ID' '(unset)'

# ── 3. Bring up the stack ─────────────────────────────────────────────────────
Write-Step "Starting Keystone (branch: $branchId)"
$composeArgs = @('compose', '-f', $ComposeFile, '--env-file', $EnvFile, 'up', '-d', '--remove-orphans')
if ($Rebuild) { $composeArgs += '--build' }
& docker @composeArgs
if ($LASTEXITCODE -ne 0) { Fail 'docker compose failed to start the stack (see output above).' }
Write-Ok 'Containers started.'

# ── 4. Wait for the API to report healthy ─────────────────────────────────────
Write-Step "Waiting for the API on http://localhost:$apiPort/health"
$healthy = $false
foreach ($i in 1..40) {   # ~2 min at 3s intervals; first run builds images
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$apiPort/health" -TimeoutSec 3 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $healthy = $true; break }
  } catch { Start-Sleep -Seconds 3 }
}
if ($healthy) {
  Write-Ok 'API is healthy.'
} else {
  Write-Warn "API did not report healthy yet. It may still be building/migrating."
  Write-Warn "Check logs:  docker compose -f `"$ComposeFile`" --env-file `"$EnvFile`" logs -f api"
}

# ── 5. Open the dashboard ─────────────────────────────────────────────────────
$dashUrl = "http://localhost:$dashboardPort"
Write-Step "Dashboard: $dashUrl"
if (-not $NoBrowser -and $healthy) { Start-Process $dashUrl }

Write-Host ''
Write-Ok 'Keystone is up. Re-run this script any time to reconcile the stack.'
Write-Host "    Stop with:  infra\launcher\keystone-stop.ps1" -ForegroundColor DarkGray
