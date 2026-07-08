from __future__ import annotations

import json
import os
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

ROOT = Path(__file__).parent

# Repository layout
APP_DIR = ROOT / ""
TEMPLATES = APP_DIR / "templates"
STATIC = APP_DIR / "static"
FRONTEND_FILES = (
    TEMPLATES / "index.html",
    STATIC / "css" / "styles.css",
    STATIC / "js" / "api.js",
    STATIC / "js" / "app.js",
)


st.set_page_config(
    page_title="GPB Risk Desk",
    page_icon="",
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


def frontend_signature() -> tuple[int, ...]:
    """Return asset modification times used by the development auto-reloader."""
    try:
        return tuple(path.stat().st_mtime_ns for path in FRONTEND_FILES if path.exists())
    except Exception as e:
        st.warning(f"Could not read frontend files: {e}")
        return ()


@st.fragment(run_every=1.0)
def watch_frontend_files() -> None:
    """Rerun the app when an HTML, CSS or JS file is saved."""
    signature = frontend_signature()
    previous = st.session_state.get("frontend_signature")
    st.session_state.frontend_signature = signature

    if previous is not None and previous != signature:
        st.rerun()


watch_frontend_files()


def load_frontend() -> str:
    """Build the iframe document while keeping frontend sources separate."""
    try:
        template = (TEMPLATES / "index.html").read_text(encoding="utf-8")
        styles = (STATIC / "css" / "styles.css").read_text(encoding="utf-8")
        api_js = (STATIC / "js" / "api.js").read_text(encoding="utf-8")
        app_js = (STATIC / "js" / "app.js").read_text(encoding="utf-8")
    except FileNotFoundError as e:
        return f"<h1>Error: Missing frontend files</h1><p>{e}</p>"

    config = {
        "baseUrl": os.getenv("API_BASE_URL", "http://localhost:8000/api/v1").rstrip("/"),
        "useMock": os.getenv("USE_MOCK_API", "true").lower() in {"1", "true", "yes"},
    }

    return (
        template.replace("/*__STYLES__*/", styles)
        .replace("/*__API_CONFIG__*/", f"window.APP_CONFIG = {json.dumps(config)};")
        .replace("/*__API_CLIENT__*/", api_js)
        .replace("/*__APP__*/", app_js)
    )


def render_frontend() -> None:
    """Render the current frontend sources inside the Streamlit page."""
    components.html(load_frontend(), height=1600, scrolling=True)


# Streamlit auto-reload for frontend files
DEV_AUTO_RELOAD = os.getenv("DEV_AUTO_RELOAD", "true").lower() in {"1", "true", "yes"}

if DEV_AUTO_RELOAD:
    @st.fragment(run_every="1s")
    def frontend_with_auto_reload() -> None:
        render_frontend()

    frontend_with_auto_reload()
else:
    render_frontend()
