@echo off
setlocal EnableDelayedExpansion

echo Checking environment...

REM Check for Git
git --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Git is not installed.
    echo Attempting to install Git via Winget...
    winget install --id Git.Git -e --source winget
    if %ERRORLEVEL% NEQ 0 (
        echo Failed to install Git. Please install Git manually from https://git-scm.com/downloads
        pause
        exit /b 1
    )
    echo Git installed successfully. Please restart this script to apply changes.
    pause
    exit /b 0
)

REM Check if .git folder exists (ZIP download scenario)
if not exist ".git" (
    echo No Git repository found. Initializing...
    git init
    git remote add origin https://github.com/ComplexSocialInteractionsLab/Kamiak-GUI.git
    git fetch origin
    echo Resetting local files to match remote repository...
    git reset --hard origin/master
    echo Repository initialized. You may need to force update to sync with master.
    set BEHIND=1
    goto :PROMPT_UPDATE
)

REM Standard Update Check
echo Checking for updates...
git fetch origin
if %ERRORLEVEL% NEQ 0 (
    echo Git fetch failed. Attempting to fix remote...
    git remote remove origin
    git remote add origin https://github.com/ComplexSocialInteractionsLab/Kamiak-GUI.git
    git fetch origin
)

for /f "tokens=*" %%i in ('git rev-list HEAD...origin/master --count') do set BEHIND=%%i

:PROMPT_UPDATE
if "%BEHIND%"=="0" (
    echo Application is up to date.
    exit /b 0
)

echo.
echo ==========================================
echo       New Update Available!
echo ==========================================
echo.
set /P ACCEPT=Do you want to update the application now? (Y/N): 

if /I "%ACCEPT%" NEQ "Y" (
    echo Update skipped.
    exit /b 0
)

echo.
echo Updating application...
REM Force reset to avoid conflicts with local changes/zip downloads
git reset --hard origin/master

echo.
echo Installing dependencies...
cmd /c npm install

echo.
echo Rebuilding application...
cmd /c npm run build

echo.
echo Update complete!
pause
exit /b 0
