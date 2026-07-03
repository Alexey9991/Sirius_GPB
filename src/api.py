from datetime import datetime

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from .repository import EVENTS, PROJECTS
from .schemas import AnalysisRequest, AnalysisResponse, Driver, Event, Overview, OverviewStats, Project, RiskLevel


app = FastAPI(title="Risk Intelligence API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    # DEVELOPMENT ONLY. In production, replace "*" with the exact Streamlit
    # origin, for example ["https://risk.example.ru"].
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/overview", response_model=Overview)
def overview() -> Overview:
    # DATABASE: calculate stats and load favorites/recent events here.
    # Keep the Overview response shape unchanged so the dashboard can render it.
    return Overview(
        stats=OverviewStats(projects_total=42, critical_projects=5, events_today=1847, sources_online=126),
        favorites=PROJECTS,
        recent_events=EVENTS,
    )


@app.get("/api/v1/projects", response_model=list[Project])
def projects(query: str = "", level: str = "ALL") -> list[Project]:
    # DATABASE: replace filtering of PROJECTS with a parameterized DB query.
    # Preserve query and level parameters because app/static/js/api.js sends them.
    needle = query.casefold().strip()
    return [
        project for project in PROJECTS
        if (level == "ALL" or project.level.value == level)
        and (not needle or needle in f"{project.name} {project.city} {project.developer}".casefold())
    ]


@app.get("/api/v1/alerts", response_model=list[Event])
def alerts(level: str = "ALL", limit: int = Query(100, ge=1, le=500)) -> list[Event]:
    # DATABASE: return risk events ordered by published_at descending.
    items = [item for item in EVENTS if item.level != RiskLevel.GREEN and (level == "ALL" or item.level.value == level)]
    return items[:limit]


@app.get("/api/v1/events", response_model=list[Event])
def events(limit: int = Query(100, ge=1, le=500)) -> list[Event]:
    # DATABASE: return the normalized news/event feed here.
    return EVENTS[:limit]


@app.post("/api/v1/analysis", response_model=AnalysisResponse)
def analyze(payload: AnalysisRequest) -> AnalysisResponse:
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
    return AnalysisResponse(
        project_id=project.id if project else None,
        project_name=payload.project_name,
        level=level,
        score=score,
        summary="Демонстрационный ответ API. Здесь должен быть итог модели с объяснением найденных риск-сигналов.",
        drivers=[Driver(name=label, value=value, text="Объяснение вклада фактора") for label, value in zip(labels, values)],
        events=related or EVENTS[:2],
        model_version="reference-1",
        analyzed_at=datetime.now().astimezone(),
    )
