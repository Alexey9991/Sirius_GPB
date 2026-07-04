from __future__ import annotations

import json
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components


ROOT = Path(__file__).parent
# Repository layout:
#   src/main.py
#   src/app/templates/index.html
#   src/app/static/css/styles.css
#   src/app/static/js/*.js
APP_DIR = ROOT / "app"
TEMPLATES = APP_DIR / "templates"
STATIC = APP_DIR / "static"


st.set_page_config(
    page_title="GazprombankRAGanalys",
    page_icon="🏦",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
      .stApp { background: #f4f7fb; }
      .block-container { max-width: 100%; padding: 0; }
      header[data-testid="stHeader"], #MainMenu, footer,
      div[data-testid="stToolbar"] { display: none !important; }
      iframe { display: block; }
    </style>
    """,
    unsafe_allow_html=True,
)


def load_frontend() -> str:
    """Build the standalone demo site without connecting to a backend."""
    template = (TEMPLATES / "index.html").read_text(encoding="utf-8")
    styles = (STATIC / "css" / "styles.css").read_text(encoding="utf-8")
    api_js = (STATIC / "js" / "api.js").read_text(encoding="utf-8")
    app_js = (STATIC / "js" / "app.js").read_text(encoding="utf-8")

    config = {"useMock": True}

    return (
        template.replace("/*__STYLES__*/", styles)
        .replace("/*__API_CONFIG__*/", f"window.APP_CONFIG = {json.dumps(config)};")
        .replace("/*__API_CLIENT__*/", api_js)
        .replace("/*__APP__*/", app_js)
    )


components.html(load_frontend(), height=1600, scrolling=True)
