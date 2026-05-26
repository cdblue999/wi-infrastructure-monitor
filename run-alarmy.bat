@echo off
REM ── Run WI Alarm Engine (for Windows Task Scheduler) ──
cd /d "%~dp0"
node tasks/runAlarmEngine.js >> logs\alarmy.log 2>&1
