from __future__ import annotations

from typing import Any

from flask import Flask
from flask_cors import CORS

from .catalog import DemoProjectCatalog, ProjectCatalog
from .config import Config
from .database import Database
from .repositories import SavedStateRepository, SqlAlchemySavedStateRepository
from .routes import api
from .services import AnalysisService, DemoAnalysisService


def create_app(
    config: dict[str, Any] | None = None,
    *,
    project_catalog: ProjectCatalog | None = None,
    saved_state_repository: SavedStateRepository | None = None,
    analysis_service: AnalysisService | None = None,
) -> Flask:
    """Application factory and dependency composition root."""
    app = Flask(__name__)
    app.config.from_object(Config)
    if config:
        app.config.update(config)

    database = Database(app.config["DATABASE_URL"])
    if app.config["AUTO_CREATE_DB"]:
        database.create_schema()

    resolved_catalog = project_catalog or DemoProjectCatalog()
    app.extensions["database"] = database
    app.extensions["project_catalog"] = resolved_catalog
    app.extensions["saved_state_repository"] = (
        saved_state_repository or SqlAlchemySavedStateRepository(database)
    )
    app.extensions["analysis_service"] = (
        analysis_service or DemoAnalysisService(resolved_catalog)
    )

    CORS(
        app,
        resources={
            r"/api/*": {"origins": "*"},
            r"/health": {"origins": "*"},
            r"/ready": {"origins": "*"},
        },
        methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type", "X-User-ID"],
        supports_credentials=False,
    )
    app.register_blueprint(api)
    return app
