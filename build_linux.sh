#!/bin/sh
python3 -m pip install -r requirements.txt
python3 -m PyInstaller --noconfirm --onedir --name TheLastSignal --add-data "web:web" main.py
echo "Build complete: dist/TheLastSignal/"
