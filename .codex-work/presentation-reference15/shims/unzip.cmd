@echo off
if "%~1"=="-Z1" (
  "%SystemRoot%\System32\tar.exe" -tf "%~2"
  exit /b
)
if "%~1"=="-p" (
  "%SystemRoot%\System32\tar.exe" -xOf "%~2" "%~3"
  exit /b
)
echo Unsupported unzip arguments 1>&2
exit /b 2
