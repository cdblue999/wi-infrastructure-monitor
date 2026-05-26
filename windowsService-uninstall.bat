@echo off
REM ── Uninstall WI Infrastructure Monitor Windows Service ──
npx ts-node windowsService.ts uninstall
pause
