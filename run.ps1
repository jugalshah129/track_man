# Make Something — Resume Script (Windows)
# Resume script — double-click run.bat to restart your project

$ErrorActionPreference = "Stop"
$INSTALL_DIR = $PSScriptRoot
Set-Location $INSTALL_DIR

Write-Host ""
Write-Host "  ==============================" -ForegroundColor Cyan
Write-Host "        Make Something" -ForegroundColor Cyan
Write-Host "  ==============================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Check dependencies ---
if (-not (Test-Path "$INSTALL_DIR\node_modules")) {
    Write-Host "-> Installing dependencies..."
    npm install
} else {
    Write-Host "[OK] Dependencies ready"
}

# --- 2. Kill any existing process on port 3000 ---
$existing = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($existing) {
    $existing | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

# --- 3. Start dev server ---
Write-Host "-> Starting dev server..."
try {
    $npmPath = (Get-Command npm).Source
} catch {
    Write-Host ""
    Write-Host "  npm not found in PATH. Please close and reopen PowerShell, then re-run this script." -ForegroundColor Yellow
    exit 1
}
$devProcess = Start-Process -FilePath $npmPath -ArgumentList "run","dev" -WorkingDirectory $INSTALL_DIR -PassThru -WindowStyle Hidden

try {
    # --- 4. Wait for server ---
    Write-Host "-> Waiting for your app to start..."
    $tries = 0
    $maxTries = 30
    while ($tries -lt $maxTries) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) { break }
        } catch {}
        Start-Sleep -Seconds 1
        $tries++
    }

    # --- 5. Open browser ---
    Start-Process "http://localhost:3000"

    Write-Host ""
    Write-Host "  [OK] Ready! Launching Codex..." -ForegroundColor Green
    Write-Host ""

    # --- 6. Launch Codex (full-auto so beginners never see approval prompts) ---
    codex --full-auto
} finally {
    # --- 7. Cleanup ---
    Write-Host ""
    Write-Host "  Stopping dev server..."
    Stop-Process -Id $devProcess.Id -Force -ErrorAction SilentlyContinue
    $remaining = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
    if ($remaining) {
        $remaining | ForEach-Object {
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
}
