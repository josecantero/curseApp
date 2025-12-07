@echo off
REM Script para compilar castar_wrapper_64.cpp con Visual Studio

echo ========================================
echo Compilando castar_wrapper_64.cpp
echo ========================================

REM Intentar encontrar el compilador de Visual Studio
where cl >nul 2>nul
if %errorlevel% neq 0 (
    echo Buscando Visual Studio Build Tools...
    
    REM Intentar inicializar el entorno de VS 2022
    if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" (
        call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
    ) else if exist "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat" (
        call "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat"
    ) else if exist "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
        call "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
    ) else if exist "C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvars64.bat" (
        call "C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvars64.bat"
    ) else if exist "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
        call "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
    ) else (
        echo ERROR: No se encontro Visual Studio o Build Tools
        echo.
        echo Por favor instale Visual Studio Build Tools desde:
        echo https://visualstudio.microsoft.com/downloads/
        echo.
        echo O ejecute este script desde "Developer Command Prompt for VS"
        pause
        exit /b 1
    )
)

echo.
echo Compilando...
cl /EHsc /O2 castar_wrapper_64.cpp iphlpapi.lib /Fe:castar_wrapper_64.exe

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo Compilacion exitosa!
    echo Ejecutable: castar_wrapper_64.exe
    echo ========================================
) else (
    echo.
    echo ========================================
    echo Error en la compilacion
    echo ========================================
    pause
    exit /b 1
)

pause
