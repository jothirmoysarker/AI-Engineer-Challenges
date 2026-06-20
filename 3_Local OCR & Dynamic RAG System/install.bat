@echo off
echo =============================================
echo  Installing Multilingual RAG Pipeline
echo =============================================
cd /d "%~dp0"

echo.
echo [1/3] Installing PyTorch (CPU)...
py -m pip install torch --index-url https://download.pytorch.org/whl/cpu

echo.
echo [2/3] Installing remaining dependencies...
py -m pip install -r requirements.txt

echo.
echo [3/3] Done!
echo Run start.bat to launch the server.
echo.
pause
