@echo off
setlocal
cd /d "%~dp0"

set "NODE_COMMAND=node"
where node >nul 2>nul
if not errorlevel 1 goto node_ready

set "NODE_COMMAND=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%NODE_COMMAND%" goto node_ready

echo Node.js was not found.
echo Install Node.js or open this project in Codex first.
pause
exit /b 1

:node_ready
if exist "node_modules\next\dist\bin\next" goto dependencies_ready

echo Project dependencies are missing.
echo Install the dependencies in Codex first.
pause
exit /b 1

:dependencies_ready
echo Starting the knowledge workspace. Keep this window open.
start "" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:3000'"
call "%NODE_COMMAND%" "node_modules\next\dist\bin\next" dev

if not errorlevel 1 exit /b 0
echo.
echo The workspace failed to start. Keep this window open to read the error above.
pause
exit /b 1
