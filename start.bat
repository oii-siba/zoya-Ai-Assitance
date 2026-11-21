@echo off
chcp 65001 >nul
title Zoya AI Assistance
cls
echo ======================================================================
echo           🌸 ZOYA AI ASSISTANCE - QUICK LAUNCHER 🌸
echo ======================================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not detected on your computer!
    echo Please download and install Node.js ^(v18 or higher^) from:
    echo 👉 https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Auto-install dependencies if node_modules is missing
if not exist "node_modules\" (
    echo [*] First time setup detected. Installing project dependencies...
    echo [*] Running: npm install (this may take 1-2 minutes)...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Failed to install dependencies. Please check your internet connection.
        pause
        exit /b 1
    )
    echo.
    echo [✔] Dependencies installed successfully!
    echo.
)

:: 3. Setup .env file if missing
if not exist ".env" (
    if exist ".env.example" (
        copy .env.example .env >nul
        echo [✔] Initialized local .env configuration file.
    )
)

:: 4. Launch Zoya
echo [*] Launching Zoya AI Assistance...
echo [*] Dev server starting at: http://localhost:5173
echo.
call npm run dev

pause
