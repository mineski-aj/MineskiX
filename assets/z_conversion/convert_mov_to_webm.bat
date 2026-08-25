@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ===============================
echo   MOV to WebM Converter
echo ===============================
echo.

where ffmpeg >nul 2>nul
if errorlevel 1 (
    echo Error: ffmpeg is not installed or not on PATH.
    echo Install it from https://ffmpeg.org/download.html
    echo.
    pause
    exit /b 1
)

set count=0
for %%f in (*.mov *.MOV) do set /a count+=1

if %count%==0 (
    echo No .mov files found in this folder.
    echo.
    pause
    exit /b 0
)

echo Found %count% .mov file(s). Starting conversion...
echo.

set success=0
set failed=0

for %%f in (*.mov *.MOV) do (
    set "output=%%~dpnf.webm"
    echo Converting: %%f -^> !output!

    ffmpeg -i "%%f" -vf "format=yuva420p" -c:v libvpx-vp9 -crf 33 -b:v 0 -auto-alt-ref 0 -c:a libopus -y "!output!" -loglevel error -stats

    if !errorlevel! equ 0 (
        echo   Done!
        set /a success+=1
    ) else (
        echo   Failed!
        set /a failed+=1
    )
    echo.
)

echo ===============================
echo Conversion complete!
echo   Succeeded: %success%
echo   Failed:    %failed%
echo ===============================
echo.
pause
