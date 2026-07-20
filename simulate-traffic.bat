@echo off
setlocal enabledelayedexpansion
title DP WAF - Traffic Simulator

:menu
cls
echo ============================================
echo   DP WAF Training Lab - Traffic Simulator
echo ============================================
echo.
echo   1. Hit single origin (localhost:6060)      - shows the capacity wall
echo   2. Hit load balancer (localhost:6060)       - after npm run lb + origin1/2/3
echo   3. Custom target
echo   4. Exit
echo.
set /p choice="Choose an option [1-4]: "

if "%choice%"=="1" goto single
if "%choice%"=="2" goto lb
if "%choice%"=="3" goto custom
if "%choice%"=="4" goto end
goto menu

:single
echo.
echo Flooding http://localhost:6060 (single origin) ...
echo.
node flood.js http://localhost:6060 10 40
goto after

:lb
echo.
echo Flooding http://localhost:6060 (through the load balancer) ...
echo Make sure origin1/origin2/origin3 and the lb are already running.
echo.
node flood.js http://localhost:6060 15 90
goto after

:custom
set /p target="Target URL (e.g. http://localhost:6060): "
set /p conc="Concurrency [10]: "
set /p total="Total requests [40]: "
if "%conc%"=="" set conc=10
if "%total%"=="" set total=40
echo.
node flood.js %target% %conc% %total%
goto after

:after
echo.
pause
goto menu

:end
endlocal
