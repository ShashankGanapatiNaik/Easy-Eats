@echo off
REM ─────────────────────────────────────────────────────────────────────────
REM  start.bat — Easy Eats local dev (Windows CMD, no Docker)
REM  Usage: Double-click start.bat OR run from CMD
REM ─────────────────────────────────────────────────────────────────────────

echo.
echo  Easy Eats - Local Dev Starter (Windows)
echo  ─────────────────────────────────────────

SET ROOT=%~dp0
SET BACKEND=%ROOT%backend
SET FRONTEND=%ROOT%frontend

REM ── Check if .env exists and is configured ──────────────────────────────

IF NOT EXIST "%BACKEND%\.env" (
    echo  Creating .env from template...
    copy "%BACKEND%\.env.example" "%BACKEND%\.env" >nul
    echo.
    echo  ACTION REQUIRED:
    echo  Open backend\.env and replace CHANGE_ME with your MongoDB Atlas URI.
    echo  Then double-click start.bat again.
    echo.
    pause
    exit /b 1
)

findstr /C:"CHANGE_ME" "%BACKEND%\.env" >nul 2>&1
IF %ERRORLEVEL% EQU 0 (
    echo.
    echo  ERROR: backend\.env still has CHANGE_ME placeholders.
    echo.
    echo  Steps to fix:
    echo  1. Go to cloud.mongodb.com and create a free M0 cluster
    echo  2. Network Access - Add your IP address
    echo  3. Database Access - Create user with readWrite role
    echo  4. Connect - Drivers - Python - Copy connection string
    echo  5. Open backend\.env and paste it as MONGODB_URI=...
    echo.
    pause
    exit /b 1
)

REM ── Setup Python venv ───────────────────────────────────────────────────

echo.
echo  Setting up Python backend...

IF NOT EXIST "%BACKEND%\.venv" (
    echo   Creating virtual environment...
    cd /d "%BACKEND%"
    python -m venv .venv
)

echo   Installing Python dependencies...
"%BACKEND%\.venv\Scripts\pip.exe" install -q -r "%BACKEND%\requirements.txt"

echo   Backend ready!

REM ── Setup frontend ──────────────────────────────────────────────────────

echo.
echo  Setting up frontend...

IF NOT EXIST "%FRONTEND%\node_modules" (
    echo   Installing npm packages (first time, ~30 sec)...
    cd /d "%FRONTEND%"
    npm install --silent
)

echo   Frontend ready!

REM ── Optional seed ──────────────────────────────────────────────────────

echo.
set /p SEED="Seed demo data? (y/N): "
IF /I "%SEED%"=="y" (
    echo   Seeding demo data...
    "%BACKEND%\.venv\Scripts\python.exe" "%BACKEND%\scripts\seed_demo.py"
)

REM ── Launch servers in separate windows ─────────────────────────────────

echo.
echo  Launching servers...
echo   Backend  -^> http://localhost:8000
echo   Frontend -^> http://localhost:5173
echo.

REM Backend window
start "Easy Eats Backend" cmd /k "cd /d "%BACKEND%" && .venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 2 /nobreak >nul

REM Frontend window
start "Easy Eats Frontend" cmd /k "cd /d "%FRONTEND%" && npm run dev"

echo  Both servers launched in separate windows.
echo  Open http://localhost:5173 in your browser.
echo.
pause
