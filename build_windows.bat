@echo off
python -m pip install -r requirements.txt
python -m PyInstaller --noconfirm --onedir --windowed --name "TheLastSignal" --add-data "web;web" main.py
echo Build complete: dist\TheLastSignal\TheLastSignal.exe
pause
