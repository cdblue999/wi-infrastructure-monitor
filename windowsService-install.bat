@echo off
REM ── Install WI Infrastructure Monitor as a Windows Service ──
npm run build && npx ts-node windowsService.ts install
pause
