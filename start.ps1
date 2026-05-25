# ─────────────────────────────────────────────────────────────────────────────
#  start.ps1 — Easy Eats local dev on Windows (no Docker)
#  Usage (in PowerShell):  .\start.ps1
#  If execution policy error:  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# ─────────────────────────────────────────────────────────────────────────────

$Root     = $PSScriptRoot
$Backend  = "$Root\backend"
$Frontend = "$Root\frontend"

Write-Host ""
Write-Host "🍔  Easy Eats — Local Dev Starter (Windows)" -ForegroundColor Green
Write-Host "─────────────────────────────────────────────"

# ── Check prerequisites ───────────────────────────────────────────────────────

function Check-Command($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        Write-Host "✗  $name not found. Please install it first." -ForegroundColor Red
        exit 1
    }
    Write-Host "✓  $name found" -ForegroundColor Green
}

Write-Host ""
Write-Host "Checking prerequisites..."
Check-Command python
Check-Command pip
Check-Command node
Check-Command npm

# ── Backend setup ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Setting up backend..."
Set-Location $Backend

if (-not (Test-Path ".venv")) {
    Write-Host "  Creating virtual environment..."
    python -m venv .venv
}

# Install dependencies
Write-Host "  Installing Python dependencies..."
& ".venv\Scripts\pip.exe" install -q -r requirements.txt

# Check .env
if (-not (Test-Path ".env")) {
    Write-Host "  ⚠  .env not found. Creating from template..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "  ✏  Edit backend\.env and add your MONGODB_URI, then re-run." -ForegroundColor Yellow
    exit 1
}

# Check if still placeholder
$envContent = Get-Content ".env" -Raw
if ($envContent -match "CHANGE_ME") {
    Write-Host ""
    Write-Host "✗  backend\.env still has CHANGE_ME placeholders." -ForegroundColor Red
    Write-Host "   Open backend\.env and set your MongoDB Atlas MONGODB_URI." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   Quick Atlas steps:"
    Write-Host "   1. cloud.mongodb.com → Create free M0 cluster"
    Write-Host "   2. Network Access → Add your IP"
    Write-Host "   3. Database Access → Add user with readWrite"
    Write-Host "   4. Connect → Drivers → Python → copy URI"
    Write-Host "   5. Paste into backend\.env"
    Write-Host ""
    exit 1
}

Write-Host "  ✓  Backend ready" -ForegroundColor Green

# ── Frontend setup ────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Setting up frontend..."
Set-Location $Frontend

if (-not (Test-Path "node_modules")) {
    Write-Host "  Installing npm packages (first run)..."
    npm install --silent
} else {
    Write-Host "  npm packages already installed"
}

Write-Host "  ✓  Frontend ready" -ForegroundColor Green

# ── Seed prompt ───────────────────────────────────────────────────────────────

Write-Host ""
$seed = Read-Host "Seed demo data? (y/N)"
if ($seed -match "^[Yy]$") {
    Set-Location $Backend
    & ".venv\Scripts\python.exe" scripts\seed_demo.py
}

# ── Start both servers ────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Starting servers..." -ForegroundColor Green
Write-Host "  Backend  → http://localhost:8000"
Write-Host "  Frontend → http://localhost:5173"
Write-Host ""
Write-Host "  Close this window or press Ctrl+C to stop."
Write-Host "─────────────────────────────────────────────"

# Start backend in new window
$backendCmd = "Set-Location '$Backend'; & '.venv\Scripts\uvicorn.exe' app.main:app --host 0.0.0.0 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

Start-Sleep -Seconds 2

# Start frontend in new window
$frontendCmd = "Set-Location '$Frontend'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host ""
Write-Host "✓  Both servers launched in separate windows." -ForegroundColor Green
Write-Host "   Backend:  http://localhost:8000/docs"
Write-Host "   Frontend: http://localhost:5173"
