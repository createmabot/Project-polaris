@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
set "DO_SEED=1"

if /I "%~1"=="--no-seed" (
  set "DO_SEED=0"
)

where docker >nul 2>&1
if errorlevel 1 (
  echo [ERROR] docker command is not available.
  exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] pnpm command is not available.
  exit /b 1
)

pushd "%ROOT_DIR%" >nul
if errorlevel 1 (
  echo [ERROR] Failed to move to repository root.
  exit /b 1
)

echo.
echo [1/4] Ensure postgres container is up...
docker compose up -d postgres
if errorlevel 1 goto :failed

echo [2/4] Restart postgres container...
docker compose restart postgres
if errorlevel 1 goto :failed

echo [3/4] Apply Prisma migrations...
pushd backend >nul
if errorlevel 1 goto :failed
call pnpm exec prisma migrate deploy
if errorlevel 1 goto :failed

if "%DO_SEED%"=="1" (
  echo [4/4] Seed database...
  call pnpm exec prisma db seed
  if errorlevel 1 goto :failed
) else (
  echo [4/4] Seed skipped (--no-seed).
)

popd >nul
popd >nul
echo.
echo [DONE] DB restart and update completed.
exit /b 0

:failed
echo.
echo [FAILED] DB refresh process failed.
exit /b 1
