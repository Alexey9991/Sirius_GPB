from datetime import datetime
import os

from flask import Flask, jsonify, request
from flask_cors import CORS
from pydantic import BaseModel, ValidationError

from .repository import EVENTS, PROJECTS
from .schemas import AnalysisRequest, AnalysisResponse, Driver, Event, Overview, OverviewStats, Project, RiskLevel


app = Flask(__name__)
app.config.update(API_TITLE="Risk Intelligence API", API_VERSION="1.0.0")
CORS(
    app,
    resources={r"/api/*": {"origins": "*"}, r"/health": {"origins": "*"}},
    methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    supports_credentials=False,
)


def json_response(payload: BaseModel | list[BaseModel], status: int = 200):
    """Serialize Pydantic models before passing them to Flask's JSON layer."""
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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/overview")
def overview():
    # DATABASE: calculate stats and load favorites/recent events here.
    # Keep the Overview response shape unchanged so the dashboard can render it.
    return json_response(
        Overview(
            stats=OverviewStats(projects_total=42, critical_projects=5, events_today=1847, sources_online=126),
            favorites=PROJECTS,
            recent_events=EVENTS,
        )
    )


@app.get("/api/v1/projects")
def projects():
    # DATABASE: replace filtering of PROJECTS with a parameterized DB query.
    # Preserve query and level parameters because app/static/js/api.js sends them.
    needle = request.args.get("query", "").casefold().strip()
    level = request.args.get("level", "ALL")
    return json_response(
        [
            project
            for project in PROJECTS
            if (level == "ALL" or project.level.value == level)
            and (not needle or needle in f"{project.name} {project.city} {project.developer}".casefold())
        ]
    )


@app.get("/api/v1/alerts")
def alerts():
    # DATABASE: return risk events ordered by published_at descending.
    limit = parse_limit()
    if not isinstance(limit, int):
        return limit
    level = request.args.get("level", "ALL")
    items = [item for item in EVENTS if item.level != RiskLevel.GREEN and (level == "ALL" or item.level.value == level)]
    return json_response(items[:limit])


@app.get("/api/v1/events")
def events():
    # DATABASE: return the normalized news/event feed here.
    limit = parse_limit()
    if not isinstance(limit, int):
        return limit
    return json_response(EVENTS[:limit])


@app.post("/api/v1/analysis")
def analyze():
    """Run project risk analysis and return the frontend contract.

    LARGE MODEL INTEGRATION POINT
    -----------------------------
    The deterministic code below is a demo and must be replaced with backend
    orchestration. A typical production flow is:

    1. Find the project in the database by payload.project_name.
    2. Load recent normalized news/events for that project.
    3. Build a prompt from trusted database records. Never send API keys or
       model calls to app/static/js/api.js.
    4. Call the selected large-model API from a separate model_client.py.
    5. Validate the model JSON and convert it to AnalysisResponse.
    6. Save the analysis/model version in the database if history is required.

    Keep this endpoint and AnalysisResponse fields unchanged unless the API
    contract is updated together with app/static/js/api.js. The current frontend
    waits for a synchronous response; use a job API for long-running analysis.
    """
    try:
        payload = AnalysisRequest.model_validate(request.get_json(silent=True) or {})
    except ValidationError as error:
        return jsonify({"detail": error.errors(include_url=False)}), 422

    name = payload.project_name.casefold()
    is_red = "север" in name or "берег" in name
    is_yellow = "лес" in name or "квартал" in name
    level = RiskLevel.RED if is_red else RiskLevel.YELLOW if is_yellow else RiskLevel.GREEN
    score = {RiskLevel.RED: 86, RiskLevel.YELLOW: 57, RiskLevel.GREEN: 18}[level]
    values = {
        RiskLevel.RED: [91, 88, 74, 63],
        RiskLevel.YELLOW: [55, 22, 48, 35],
        RiskLevel.GREEN: [18, 10, 16, 22],
    }[level]
    labels = ["Срыв сроков", "Юридический риск", "Репутация", "Финансовый риск"]
    project = next((item for item in PROJECTS if item.name.casefold() == name), None)
    related = [item for item in EVENTS if item.project_name.casefold() == name]
    return json_response(AnalysisResponse(
        project_id=project.id if project else None,
        project_name=payload.project_name,
        level=level,
        score=score,
        summary="Демонстрационный ответ API. Здесь должен быть итог модели с объяснением найденных риск-сигналов.",
        drivers=[Driver(name=label, value=value, text="Объяснение вклада фактора") for label, value in zip(labels, values)],
        events=related or EVENTS[:2],
        model_version="reference-1",
        analyzed_at=datetime.now().astimezone(),
    ))


if __name__ == "__main__":
    app.run(
        host=os.getenv("API_HOST", "127.0.0.1"),
        port=int(os.getenv("API_PORT", "8000")),
        debug=os.getenv("FLASK_DEBUG", "false").lower() in {"1", "true", "yes"},
    )
