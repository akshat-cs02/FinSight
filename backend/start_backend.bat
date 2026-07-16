@echo off
REM Launch the FinSight backend using the project venv on port 8888.
REM Double-click this file, or run:  start_backend.bat
cd /d "%~dp0"
venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8888
