from datetime import datetime
import os
from pathlib import Path
from flask import Flask, jsonify, request
from flask_cors import CORS
from sqlalchemy.orm import Session
from sqlalchemy import create_engine

# Import DB models and session manager
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

# Database initialization
DB_PATH = os.getenv("DB_PATH", os.path.join(Path(__file__).parent, "dbtest"))
DB_FILE = os.getenv("DB_FILE", os.path.join(DB_PATH, "db.sqlite3"))

# Create directory if it doesn't exist
os.makedirs(DB_PATH, exist_ok=True)

# Initialize global session factory
try:
    db_session.global_init(DB_FILE)
    db_engine = db_session.create_session().get_bind()
    print(f"✓ Database initialized at {DB_FILE}")
except Exception as e:
    print(f"✗ Database initialization error: {e}")
    raise

# Risk level mapping for filtering
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
    """Serialize SQLAlchemy models (with to_dict) or plain objects to JSON."""
    if isinstance(payload, list):
        data = [item.to_dict() if hasattr(item, "to_dict") else item for item in payload]
    else:
        data = payload.to_dict() if hasattr(payload, "to_dict") else payload
    return jsonify(data), status


def validation_response(message):
    """Return validation error response."""
    return jsonify({"detail": message}), 422


def parse_limit():
    """Parse and validate limit query parameter."""
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
    """Health check endpoint."""
    try:
        with Session(db_engine) as session:
            session.execute("SELECT 1")
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}, 500


@app.get("/api/v1/overview")
def overview():
    """Get dashboard overview with stats, recent events, and favorites."""
    try:
        with Session(db_engine) as session:
            projects_total = session.query(Project).count()
            critical_projects = session.query(Project).filter(
                Project.risk.in_(RISK_MAP["RED"] + RISK_MAP["YELLOW"])
            ).count()
            events_today = session.query(News).filter(
                News.date == datetime.now().date()
            ).count()
            sources_online = 126  # Can be replaced with actual data

            # Recent events (last 5)
            recent_events = session.query(News).order_by(News.date.desc()).limit(5).all()

            # Favorites (last 5 projects)
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
    except Exception as e:
        return json_response({"error": str(e)}, 500)


@app.get("/api/v1/projects")
def projects():
    """Get projects with optional filtering by query and risk level."""
    try:
        needle = request.args.get("query", "").casefold().strip()
        level = request.args.get("level", "ALL")

        with Session(db_engine) as session:
            query = session.query(Project)
            
            # Filter by risk level
            if level != "ALL":
                risks = RISK_MAP.get(level, [])
                if risks:
                    query = query.filter(Project.risk.in_(risks))
            
            # Filter by search query
            if needle:
                query = query.filter(
                    (Project.name.ilike(f"%{needle}%")) |
                    (Project.city.ilike(f"%{needle}%")) |
                    (Project.developer.ilike(f"%{needle}%"))
                )
            
            result = query.all()
            return json_response(result)
    except Exception as e:
        return json_response({"error": str(e)}, 500)


@app.get("/api/v1/alerts")
def alerts():
    """Get critical alerts (RED and YELLOW projects)."""
    try:
        limit = parse_limit()
        if not isinstance(limit, int):
            return limit
        
        level = request.args.get("level", "ALL")

        with Session(db_engine) as session:
            # Get projects with RED or YELLOW risk levels
            risk_filters = []
            if level == "ALL":
                risk_filters = RISK_MAP["RED"] + RISK_MAP["YELLOW"]
            else:
                risk_filters = RISK_MAP.get(level, [])
            
            if not risk_filters:
                return json_response([])

            # Find IDs of such projects
            project_ids = session.query(Project.id).filter(
                Project.risk.in_(risk_filters)
            ).subquery()
            
            # Get news for these projects, ordered by date
            items = session.query(News).filter(
                News.project_id.in_(project_ids)
            ).order_by(News.date.desc()).limit(limit).all()
            
            return json_response(items)
    except Exception as e:
        return json_response({"error": str(e)}, 500)


@app.get("/api/v1/events")
def events():
    """Get all events sorted by date."""
    try:
        limit = parse_limit()
        if not isinstance(limit, int):
            return limit
        
        with Session(db_engine) as session:
            items = session.query(News).order_by(News.date.desc()).limit(limit).all()
            return json_response(items)
    except Exception as e:
        return json_response({"error": str(e)}, 500)


@app.post("/api/v1/analysis")
def analyze():
    """Analyze a specific project and return risk assessment."""
    try:
        data = request.get_json(silent=True) or {}
        project_name = data.get("project_name")
        
        if not project_name:
            return validation_response("Missing 'project_name' field")

        with Session(db_engine) as session:
            project = session.query(Project).filter(
                Project.name.ilike(project_name)
            ).first()
            
            if not project:
                return validation_response(f"Project '{project_name}' not found")

            # Determine risk level
            risk = project.risk
            level = REVERSE_RISK.get(risk, "GREEN")

            # Collect project events/news
            events_list = session.query(News).filter(
                News.project_id == project.id
            ).all()

            # Simple heuristic for score and drivers
            negative_count = sum(1 for n in events_list if n.sentiment == "negative")
            total_events = len(events_list)
            
            # Base score depending on risk level
            if level == "RED":
                base_score = 80
            elif level == "YELLOW":
                base_score = 50
            else:
                base_score = 20
            
            score = min(100, base_score + negative_count * 5)

            # Risk factors
            drivers = []
            labels = ["Срыв сроков", "Юридический риск", "Репутация", "Финансовый риск"]
            
            # Approximate values based on risk level
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

            summary = (
                f"Анализ проекта {project.name}. Уровень риска: {risk}. "
                f"Всего событий: {total_events}, негативных: {negative_count}. "
                "Требуется детальная оценка."
            )

            response = {
                "project_id": project.id,
                "project_name": project.name,
                "level": level,
                "score": score,
                "summary": summary,
                "drivers": drivers,
                "events": events_list,
                "model_version": "db-1.0",
                "analyzed_at": datetime.now().astimezone().isoformat(),
            }
            
            return json_response(response)
    except Exception as e:
        return json_response({"error": str(e)}, 500)


if __name__ == "__main__":
    app.run(
        host=os.getenv("API_HOST", "0.0.0.0"),
        port=int(os.getenv("API_PORT", "8000")),
        debug=os.getenv("FLASK_DEBUG", "false").lower() in {"1", "true", "yes"},
    )
