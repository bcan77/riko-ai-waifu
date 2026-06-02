@echo off
setlocal enabledelayedexpansion
title mako — AI Kitsune Companion

set "ROOT_DIR=%~dp0"
set "VENV_DIR=%ROOT_DIR%venv"

echo(
echo ============================================
echo     mako — AI Kitsune Companion
echo ============================================
echo(

:: ── Check Python ───────────────────────────
echo [1/4] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Install Python 3.12 from https://www.python.org/
    pause
    exit /b 1
)
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set "PYVER=%%v"
echo     Python %PYVER%

:: ── Virtual environment ────────────────────
echo(
echo [2/4] Setting up virtual environment...
if exist "%VENV_DIR%\Scripts\python.exe" (
    echo     Virtual environment exists.
) else (
    echo     Creating virtual environment...
    python -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo     Virtual environment created.
)

call "%VENV_DIR%\Scripts\activate.bat"

:: ── Install dependencies ───────────────────
echo(
echo [3/4] Installing dependencies...
"%VENV_DIR%\Scripts\python.exe" -m pip install --upgrade pip -q

:: Check each key package and install if missing
set MISSING=0
"%VENV_DIR%\Scripts\python.exe" -c "import flask" 2>nul
if errorlevel 1 (
    set MISSING=1
    echo     Installing flask...
    "%VENV_DIR%\Scripts\python.exe" -m pip install flask -q
)

"%VENV_DIR%\Scripts\python.exe" -c "import groq" 2>nul
if errorlevel 1 (
    set MISSING=1
    echo     Installing groq...
    "%VENV_DIR%\Scripts\python.exe" -m pip install groq -q
)

"%VENV_DIR%\Scripts\python.exe" -c "import websockets" 2>nul
if errorlevel 1 (
    set MISSING=1
    echo     Installing websockets...
    "%VENV_DIR%\Scripts\python.exe" -m pip install websockets -q
)

"%VENV_DIR%\Scripts\python.exe" -c "import requests" 2>nul
if errorlevel 1 (
    set MISSING=1
    echo     Installing requests...
    "%VENV_DIR%\Scripts\python.exe" -m pip install requests -q
)

if %MISSING%==0 (
    echo     All dependencies satisfied.
)

:: ── Launch ─────────────────────────────────
echo(
echo [4/4] Launching mako...
echo(
echo   Web UI:      http://localhost:5000
echo   Remote:      http://localhost:5000/remote
echo(
cd /d "%ROOT_DIR%"
"%VENV_DIR%\Scripts\python.exe" main.py

if errorlevel 1 (
    echo(
    echo Application exited with code %errorlevel%
    pause
)

endlocal
