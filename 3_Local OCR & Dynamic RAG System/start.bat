@echo off
echo Starting Multilingual RAG Pipeline...
cd /d "%~dp0"
py -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
pause
