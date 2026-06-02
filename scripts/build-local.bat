@echo off
REM Build verification script for local development (Windows)
REM Verifies TypeScript compilation and production builds for both services

echo 🔨 Building ZIP Application Services Locally
echo ============================================
echo.

REM Check if we're in the project root
if not exist "package.json" (
    echo ❌ Must be run from project root directory
    exit /b 1
)

REM Phase 1: ZIP App TypeScript Check
echo Phase 1: ZIP App TypeScript Compilation
echo ----------------------------------------
call npm run typecheck
if errorlevel 1 (
    echo ❌ ZIP app TypeScript compilation failed
    exit /b 1
)
echo ✅ ZIP app TypeScript compilation passed
echo.

REM Phase 2: Robot Bridge TypeScript Check
echo Phase 2: Robot Bridge TypeScript Compilation
echo ---------------------------------------------
cd robot\bridge\zip-robot-bridge
call npm run typecheck
if errorlevel 1 (
    echo ❌ Robot bridge TypeScript compilation failed
    exit /b 1
)
echo ✅ Robot bridge TypeScript compilation passed
cd ..\..\..
echo.

REM Phase 3: ZIP App Production Build
echo Phase 3: ZIP App Production Build
echo ----------------------------------
call npm run build:local
if errorlevel 1 (
    echo ❌ ZIP app production build failed
    exit /b 1
)
echo ✅ ZIP app production build completed
echo.

REM Phase 4: Robot Bridge Production Build
echo Phase 4: Robot Bridge Production Build
echo --------------------------------------
cd robot\bridge\zip-robot-bridge
call npm run build:local
if errorlevel 1 (
    echo ❌ Robot bridge production build failed
    exit /b 1
)
echo ✅ Robot bridge production build completed
cd ..\..\..
echo.

REM Summary
echo ============================================
echo ✅ All builds completed successfully!
echo.
echo Next steps:
echo   1. Start robot bridge: npm run dev:bridge
echo   2. Start ZIP app: npm run dev:local
echo   3. Or run production builds:
echo      - Robot bridge: cd robot\bridge\zip-robot-bridge ^&^& npm start
echo      - ZIP app: npm start
echo.

