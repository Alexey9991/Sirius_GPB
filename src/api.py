from datetime import datetime
import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from sqlalchemy.orm import Session
from db import db_session
from db.__all_models import Project, News

app = Flask(__name__)
app.config.update(API_TITLE="Risk Intelligence API", API_VERSION="1.0.0")
CORS(
    app,
    resources={r"/api/*": {"origins": "*"}, r"/health": {"origins": "*"}},
    methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    supports_credentials=False,
)

# Инициализация БД
DB_PATH = os.path.join(os.path.dirname(__file__), "dbtest")
db_session.global_init(os.path.join(DB_PATH, "db.sqlite3"))
db_engine = db_session.create_session().get_bind()

# Сопоставление уровней риска для фильтрации
RISK_MAP = {
    "RED": ["высокий (заморожен)"],
    "YELLOW": ["средний (снят с продажи)", "низкий (задержка, в продаже)"],
    "GREEN": ["мониторинг"],
}
REVERSE_RISK = {
    "высокий (заморожен)": "RED",
    "средний (снят с продажи)": "YELLOW",
    "низкий (задержка, в продаже)": "YELLOW",
    "мониторинг": "GREEN",
}


def json_response(payload, status=200):
    """Сериализует SQLAlchemy-модели (с to_dict) или простые объекты в JSON."""
    if isinstance(payload, list):
        data = [item.to_dict() if hasattr(item, "to_dict") else item for item in payload]
    else:
        data = payload.to_dict() if hasattr(payload, "to_dict") else payload
    return jsonify(data), status


def validation_response(message):
    return jsonify({"detail": message}), 422


def parse_limit():
    raw_limit = request.args.get("limit", "100")
    try:
        limit = int(raw_limit)
    except (TypeError, ValueError):
        return validation_response("limit must be an integer between 1 and 500")
    if not 1 <= limit <= 500:
        return validation_response("limit must be between 1 and 500")
    return limit


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/v1/overview")
def overview():
    with Session(db_engine) as session:
        projects_total = session.query(Project).count()
        critical_projects = session.query(Project).filter(
            Project.risk.in_(RISK_MAP["RED"] + RISK_MAP["YELLOW"])
        ).count()
        events_today = session.query(News).filter(
            News.date == datetime.now().date()
        ).count()
        sources_online = 126  # можно оставить заглушкой или сделать отдельный запрос

        # Недавние события (последние 5)
        recent_events = session.query(News).order_by(News.date.desc()).limit(5).all()

        # Избранное – используем последние 5 проектов
        favorites = session.query(Project).limit(5).all()

    return json_response({
        "stats": {
            "projects_total": projects_total,
            "critical_projects": critical_projects,
            "events_today": events_today,
            "sources_online": sources_online,
        },
        "favorites": favorites,
        "recent_events": recent_events,
    })


@app.get("/api/v1/projects")
def projects():
    needle = request.args.get("query", "").casefold().strip()
    level = request.args.get("level", "ALL")

    with Session(db_engine) as session:
        query = session.query(Project)
        if level != "ALL":
            risks = RISK_MAP.get(level, [])
            if risks:
                query = query.filter(Project.risk.in_(risks))
        if needle:
            query = query.filter(
                (Project.name.casefold().contains(needle)) |
                (Project.city.casefold().contains(needle)) |
                (Project.developer.casefold().contains(needle))
            )
        result = query.all()
    return json_response(result)


@app.get("/api/v1/alerts")
def alerts():
    limit = parse_limit()
    if not isinstance(limit, int):
        return limit
    level = request.args.get("level", "ALL")

    with Session(db_engine) as session:
        # Берём проекты с уровнем риска из RED или YELLOW (если не ALL)
        risk_filters = []
        if level == "ALL":
            risk_filters = RISK_MAP["RED"] + RISK_MAP["YELLOW"]
        else:
            risk_filters = RISK_MAP.get(level, [])
        if not risk_filters:
            return json_response([])

        # Находим ID таких проектов
        project_ids = session.query(Project.id).filter(
            Project.risk.in_(risk_filters)
        ).subquery()
        # Берём новости этих проектов, сортируем по дате
        items = session.query(News).filter(
            News.project_id.in_(project_ids)
        ).order_by(News.date.desc()).limit(limit).all()
    return json_response(items)


@app.get("/api/v1/events")
def events():
    limit = parse_limit()
    if not isinstance(limit, int):
        return limit
    with Session(db_engine) as session:
        items = session.query(News).order_by(News.date.desc()).limit(limit).all()
    return json_response(items)


@app.post("/api/v1/analysis")
def analyze():
    data = request.get_json(silent=True) or {}
    project_name = data.get("project_name")
    if not project_name:
        return validation_response("Missing 'project_name' field")

    with Session(db_engine) as session:
        project = session.query(Project).filter(Project.name == project_name).first()
        if not project:
            return validation_response(f"Project '{project_name}' not found")

        # Определяем уровень риска
        risk = project.risk
        level = REVERSE_RISK.get(risk, "GREEN")

        # Собираем новости проекта
        events = session.query(News).filter(News.project_id == project.id).all()

        # Простая эвристика для score и drivers (демонстрация)
        negative_count = sum(1 for n in events if n.sentiment == "negative")
        total_events = len(events)
        base_score = 20 if level == "GREEN" else 50 if level == "YELLOW" else 80
        score = min(100, base_score + negative_count * 5)

        drivers = []
        labels = ["Срыв сроков", "Юридический риск", "Репутация", "Финансовый риск"]
        # Примерные значения на основе уровня
        if level == "RED":
            values = [91, 88, 74, 63]
        elif level == "YELLOW":
            values = [55, 22, 48, 35]
        else:
            values = [18, 10, 16, 22]
        for label, val in zip(labels, values):
            drivers.append({
                "name": label,
                "value": val,
                "text": "Объяснение вклада фактора"
            })

        summary = f"Анализ проекта {project_name}. Уровень риска: {risk}. " \
                  f"Всего событий: {total_events}, негативных: {negative_count}. " \
                  "Требуется детальная оценка."

        response = {
            "project_id": project.id,
            "project_name": project_name,
            "level": level,
            "score": score,
            "summary": summary,
            "drivers": drivers,
            "events": events or [],
            "model_version": "db-1.0",
            "analyzed_at": datetime.now().astimezone().isoformat(),
        }
    return json_response(response)


if __name__ == "__main__":
    app.run(
        host=os.getenv("API_HOST", "127.0.0.1"),
        port=int(os.getenv("API_PORT", "8000")),
        debug=os.getenv("FLASK_DEBUG", "false").lower() in {"1", "true", "yes"},
    )