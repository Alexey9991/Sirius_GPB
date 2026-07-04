from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request
from pydantic import BaseModel, ValidationError

from ..schemas import AnalysisRequest, ImpactAnalysisRequest, Overview, OverviewStats
from .catalog import ProjectCatalog
from .repositories import SavedStateRepository
from .services import AnalysisService


api = Blueprint("api", __name__)


def json_response(payload: BaseModel | list[BaseModel], status: int = 200):
    if isinstance(payload, BaseModel):
        data = payload.model_dump(mode="json")
    else:
        data = [item.model_dump(mode="json") for item in payload]
    return jsonify(data), status


def validation_response(message: str):
    return jsonify({"detail": message}), 422


def parse_limit() -> int | tuple:
    raw_limit = request.args.get("limit", "100")
    try:
        limit = int(raw_limit)
    except (TypeError, ValueError):
        return validation_response("limit must be an integer between 1 and 500")
    if not 1 <= limit <= 500:
        return validation_response("limit must be between 1 and 500")
    return limit


def current_user_id() -> str:
    # Replace this single boundary with the authenticated identity provider.
    return request.headers.get("X-User-ID") or current_app.config["DEFAULT_USER_ID"]


def catalog() -> ProjectCatalog:
    return current_app.extensions["project_catalog"]


def saved_state() -> SavedStateRepository:
    return current_app.extensions["saved_state_repository"]


def analysis_service() -> AnalysisService:
    return current_app.extensions["analysis_service"]


def favorite_projects():
    return [
        project
        for project_id in saved_state().list_favorite_ids(current_user_id())
        if (project := catalog().get_project(project_id)) is not None
    ]


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@api.get("/ready")
def ready() -> dict[str, str]:
    current_app.extensions["database"].ping()
    return {"status": "ready"}


@api.get("/api/v1/overview")
def overview():
    projects = catalog().list_projects()
    return json_response(
        Overview(
            stats=OverviewStats(
                projects_total=len(projects),
                critical_projects=sum(project.level.value == "RED" for project in projects),
                events_today=len(catalog().list_events(limit=500)),
                sources_online=126,
            ),
            favorites=favorite_projects(),
            recent_events=catalog().list_events(limit=100),
        )
    )


@api.get("/api/v1/projects")
def projects():
    return json_response(
        catalog().list_projects(
            query=request.args.get("query", ""),
            level=request.args.get("level", "ALL"),
        )
    )


@api.get("/api/v1/favorites")
def favorites():
    return json_response(favorite_projects())


@api.post("/api/v1/favorites/<project_id>")
def add_favorite(project_id: str):
    project = catalog().get_project(project_id)
    if project is None:
        return jsonify({"detail": "project not found"}), 404
    saved_state().add_favorite(current_user_id(), project_id)
    return json_response(project, 201)


@api.delete("/api/v1/favorites/<project_id>")
def remove_favorite(project_id: str):
    saved_state().remove_favorite(current_user_id(), project_id)
    return "", 204


@api.get("/api/v1/alerts")
def alerts():
    limit = parse_limit()
    if not isinstance(limit, int):
        return limit
    return json_response(catalog().list_alerts(request.args.get("level", "ALL"), limit))


@api.get("/api/v1/events")
def events():
    limit = parse_limit()
    if not isinstance(limit, int):
        return limit
    return json_response(catalog().list_events(limit=limit))


@api.get("/api/v1/analysis-history")
def analysis_history():
    limit = parse_limit()
    if not isinstance(limit, int):
        return limit
    return json_response(saved_state().list_analysis_history(current_user_id(), limit))


@api.get("/api/v1/risk-changes")
def risk_changes():
    limit = parse_limit()
    if not isinstance(limit, int):
        return limit
    return json_response(saved_state().list_risk_changes(current_user_id(), limit))


@api.post("/api/v1/analysis")
def analyze():
    try:
        payload = AnalysisRequest.model_validate(request.get_json(silent=True) or {})
    except ValidationError as error:
        return jsonify({"detail": error.errors(include_url=False)}), 422

    result = analysis_service().analyze(payload.project_name)
    saved_state().record_analysis(current_user_id(), result)
    return json_response(result)


@api.post("/api/v1/ai/impact")
def explain_impact():
    try:
        payload = ImpactAnalysisRequest.model_validate(request.get_json(silent=True) or {})
    except ValidationError as error:
        return jsonify({"detail": error.errors(include_url=False)}), 422
    if catalog().get_event(payload.event_id) is None:
        return jsonify({"detail": "event not found"}), 404
    return json_response(analysis_service().explain_impact(payload.event_id, payload.question))
