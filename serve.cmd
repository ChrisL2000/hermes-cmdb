@echo off
rem Serve the CMDB locally and open it. Any static server works; this needs Python.
cd /d "%~dp0"
start "" "http://127.0.0.1:8090/"
python -m http.server 8090
