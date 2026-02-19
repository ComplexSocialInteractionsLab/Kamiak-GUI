@echo off
echo Setting up Standalone Build for Windows...

REM Automatic Updates
if exist "update_app.bat" (
    call update_app.bat
)

if not exist ".next\standalone\server.js" (
    echo.
    echo ERROR: Build artifacts not found!
    echo The file ".next\standalone\server.js" is missing.
    echo.
    echo Please run the following commands to build the application first:
    echo   cmd /c npm install
    echo   cmd /c npm run build
    echo.
    echo If that doesn't work, ensure you are in the project root.
    pause
    exit /b 1
)

REM Create necessary directories
if not exist ".next\standalone\.next\static" mkdir ".next\standalone\.next\static"
if not exist ".next\standalone\public" mkdir ".next\standalone\public"

REM Copy Static Assets
echo Copying static assets...
xcopy /E /I /Y ".next\static" ".next\standalone\.next\static"
xcopy /E /I /Y "public" ".next\standalone\public"

REM Run the Server
echo Starting Server...
cd .next\standalone
set PORT=3000
node server.js
pause
