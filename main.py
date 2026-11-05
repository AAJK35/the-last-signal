import os
import sys

from nicegui import app, ui

import config


def resource_path(rel: str) -> str:
    """Works both in development and inside a PyInstaller .exe"""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, rel)


app.add_static_files("/web", resource_path("web"))

RTL = "direction: rtl; text-align: right;"


@ui.page("/")
def menu():
    ui.query("body").style("background:#07090b;")
    with ui.column().classes("absolute-center items-center gap-6"):
        ui.label("THE LAST SIGNAL").style(
            "font-size:3rem;letter-spacing:.35em;color:#c9d6cf;font-weight:300;"
        )
        ui.label("آخرین سیگنال را پیدا کن.").style(RTL + "color:#6f8078;")
        ui.button("شروع بازی", on_click=lambda: ui.navigate.to("/web/game.html")).props(
            "outline color=grey-5 size=lg"
        )
        with ui.dialog() as dlg, ui.card().style(RTL):
            for line in [
                "W A S D : حرکت",
                "ماوس : چرخاندن دوربین",
                "Shift : دویدن",
                "E : تعامل با اشیا و درها",
                "F : چراغ‌قوه",
                "Esc : توقف بازی",
            ]:
                ui.label(line)
            ui.button("بستن", on_click=dlg.close).props("flat")
        ui.button("کنترل‌ها", on_click=dlg.open).props("flat color=grey-6")
        ui.button("خروج", on_click=app.shutdown).props("flat color=grey-7")


if __name__ in {"__main__", "__mp_main__"}:
    ui.run(
        title=config.APP_TITLE,
        host=config.HOST,
        port=config.PORT,
        reload=False,
        dark=True,
        show=True,
    )
