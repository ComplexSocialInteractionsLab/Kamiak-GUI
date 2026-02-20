@echo off
cd /d "%~dp0"
echo Setting up Standalone Build for Windows...

REM Automatic Updates
if exist "update_app.bat" (
    call update_app.bat
)

REM Check for build artifacts
if exist ".next\standalone\server.js" goto :RUN_SERVER

echo.
echo ==========================================
echo       Build Artifacts Not Found
echo ==========================================
echo The application needs to be built before running.
echo Starting automatic build process...
echo.

echo Installing dependencies...
cmd /c npm install
if %ERRORLEVEL% NEQ 0 (
    echo Error installing dependencies!
    pause
    exit /b 1
)

echo.
echo Building application...
cmd /c npm run build
if %ERRORLEVEL% NEQ 0 (
    echo Error building application!
    pause
    exit /b 1
)

REM Verify build success
if not exist ".next\standalone\server.js" (
    echo.
    echo ERROR: Build failed or artifacts missing after build.
    pause
    exit /b 1
)

:RUN_SERVER
REM Create necessary directories
if not exist ".next\standalone\.next\static" mkdir ".next\standalone\.next\static"
if not exist ".next\standalone\public" mkdir ".next\standalone\public"

REM Copy Static Assets
echo Copying static assets...
xcopy /E /I /Y ".next\static" ".next\standalone\.next\static" >nul
xcopy /E /I /Y "public" ".next\standalone\public" >nul

REM Run the Server
echo Starting Server...
cd .next\standalone
set PORT=3000
node server.js
pause
