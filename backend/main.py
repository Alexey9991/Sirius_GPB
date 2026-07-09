import os
from datetime import datetime
from functools import wraps

from flask import Flask, jsonify, request
from flask_cors import CORS
from sqlalchemy import func, or_, text

import db
from db.__all_models import Project, News


RISKS_LABELS = ["Срыв сроков", "Юридический риск", "Репутация", "Финансовый риск"]

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

app = Flask(__name__)
app.config.update(API_TITLE="Risk Intelligence API", API_VERSION="1.0.0", JSON_SORT_KEYS=False)
CORS(app, resources={r"/api/*": {"origins": "*"}, r"/health": {"origins": "*"}},
     methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type"], supports_credentials=False)

# Database initialization - uses environment variables from .env.backend
try:
    db.global_init()
    print(f"✓ Database initialized successfully")
except Exception as e:
    print(f"✗ Database initialization error: {e}")
    raise


def json_response(payload, status=200):
    if isinstance(payload, list):
        data = [item.to_dict() if hasattr(item, "to_dict") else item for item in payload]
    else:
        data = payload.to_dict() if hasattr(payload, "to_dict") else payload
    return jsonify(data), status


def error_response(message, status=400):
    return jsonify({"error": message}), status


def db_session_wrapper(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        db_sess = db.create_session()
        try:
            result = f(db_sess, *args, **kwargs)
            db_sess.commit()
            return result
        except Exception as e:
            db_sess.rollback()
            raise
        finally:
            db_sess.close()
    return decorated_function


@app.get("/health")
def health():
    try:
        db_sess = db.create_session()
        db_sess.execute(text("SELECT 1"))
        db_sess.close()
        return {"status": "ok", "database": "connected"}, 200
    except Exception as e:
        return {"status": "error", "database": str(e)}, 500


@app.get("/status")
def status():
    try:
        db_sess = db.create_session()
        projects_count = db_sess.query(Project).count()
        news_count = db_sess.query(News).count()
        critical_count = db_sess.query(Project).filter(
            Project.risk.in_(RISK_MAP["RED"] + RISK_MAP["YELLOW"])
        ).count()
        db_sess.close()
        return json_response({
            "api_version": "1.0.0",
            "database": "connected",
            "statistics": {
                "total_projects": projects_count,
                "critical_projects": critical_count,
                "total_news": news_count,
            }
        })
    except Exception as e:
        return error_response(str(e), 500)


@app.get("/projects")
@db_session_wrapper
def get_projects(db_sess):
    """Get all projects with optional filtering.
    
    Query Parameters:
    - query: search by name, city, or developer
    - level: filter by risk level (RED, YELLOW, GREEN, ALL)
    - limit: limit number of results (default: 100)
    """
    try:
        query_string = request.args.get("query", "").strip()
        level = request.args.get("level", "ALL")
        limit = request.args.get("limit", 100, type=int)

        query = db_sess.query(Project)
        if level != "ALL" and level in RISK_MAP:
            risk_filters = RISK_MAP[level]
            query = query.filter(Project.risk.in_(risk_filters))
        if query_string:
            query = query.filter(
                or_(
                    func.lower(Project.name).contains(query_string.lower()),
                    func.lower(Project.city).contains(query_string.lower()),
                    func.lower(Project.developer).contains(query_string.lower()),
            ))
        if limit and 1 <= limit <= 500:
            query = query.limit(limit)
        results = query.all()
        return json_response(results), 200

    except Exception as e:
        return error_response(str(e), 400)


@app.get("/projects/<project_id>")
@db_session_wrapper
def get_project(db_sess, project_id):
    try:
        project = db_sess.query(Project).filter(Project.id == project_id).first()
        if not project:
            return error_response(f"Project '{project_id}' not found", 404)
        project_dict = project.to_dict()
        news = db_sess.query(News).filter(News.project_id == project_id).all()
        project_dict["news"] = [n.to_dict() for n in news]
        return json_response(project_dict), 200

    except Exception as e:
        return error_response(str(e), 400)


@app.post("/projects")
@db_session_wrapper
def create_project(db_sess):
    try:
        data = request.get_json()
        if not data or not data.get("name"):
            return error_response("Project name is required", 400)

        project = Project(
            name=data.get("name"),
            city=data.get("city", ""),
            region=data.get("region", ""),
            developer=data.get("developer", ""),
            builder=data.get("builder", ""),
            class_type=data.get("class_type", ""),
            selection=data.get("selection", ""),
            risk=data.get("risk", "мониторинг"),
            planned_rve_date=data.get("planned_rve_date"),
            implementation_stage=data.get("implementation_stage", "0%"),
            construction_stage=data.get("construction_stage", ""),
            schedule_status=data.get("schedule_status", ""),
        )
        db_sess.add(project)
        db_sess.flush()

        return json_response(project.to_dict()), 201
    except Exception as e:
        return error_response(str(e), 400)


@app.get("/news")
@db_session_wrapper
def get_news(db_sess):
    """Get news with optional filtering.
    
    Query Parameters:
    - limit: number of results (default: 50, max: 500)
    - project_id: filter by project
    - sentiment: filter by sentiment (positive, neutral, negative)
    - search: search in title and content
    """
    try:
        limit = request.args.get("limit", 50, type=int)
        project_id = request.args.get("project_id", "")
        sentiment = request.args.get("sentiment", "")
        search_query = request.args.get("search", "").strip()

        query = db_sess.query(News).order_by(News.date.desc())
        if project_id:
            query = query.filter(News.project_id == project_id)
        if sentiment:
            query = query.filter(News.sentiment == sentiment)
        if search_query:
            query = query.filter(
                or_(
                    func.lower(News.title).contains(search_query.lower()),
                    func.lower(News.content).contains(search_query.lower()),
            ))

        results = query.limit(limit).all()
        return json_response(results), 200
    except Exception as e:
        return error_response(str(e), 400)


@app.post("/news")
@db_session_wrapper
def create_news(db_sess):
    try:
        data = request.get_json()
        if not data or not data.get("title"):
            return error_response("News title is required", 400)

        news = News(
            project_id=data.get("project_id"),
            project_name=data.get("project_name"),
            developer=data.get("developer"),
            title=data.get("title"),
            content=data.get("content", ""),
            date=data.get("date") or datetime.now().date(),
            source=data.get("source", "Manual"),
            category=data.get("category"),
            sentiment=data.get("sentiment", "neutral"),
        )
        db_sess.add(news)
        db_sess.flush()

        return json_response(news.to_dict()), 201
    except Exception as e:
        return error_response(str(e), 400)


@app.post("/analysis")
@db_session_wrapper
def analyze_project(db_sess):
    """Analyze project and return risk assessment.
    
    Request JSON:
    - project_id (required): project ID or name to analyze
    """
    try:
        data = request.get_json()
        project_identifier = data.get("project_id") or data.get("name")
        if not project_identifier:
            return error_response("Project ID or name is required", 400)

        project = (
            db_sess.query(Project)
            .filter(or_(
                Project.id == project_identifier,
                func.lower(Project.name) == project_identifier.lower()
        )).first())
        if not project:
            return error_response(f"Project '{project_identifier}' not found", 404)

        news_items = db_sess.query(News).filter(News.project_id == project.id).all()
        negative_count = sum(1 for n in news_items if n.sentiment == "negative")
        total_events = len(news_items)
        risk_level = REVERSE_RISK.get(project.risk, "GREEN")
        base_score = 20 if risk_level == "GREEN" else 50 if risk_level == "YELLOW" else 80
        score = min(100, base_score + negative_count * 5)

        if risk_level == "RED":
            values = [91, 88, 74, 63]
        elif risk_level == "YELLOW":
            values = [55, 22, 48, 35]
        else:
            values = [18, 10, 16, 22]

        drivers = []
        for label, value in zip(RISKS_LABELS, values):
            drivers.append({
                "name": label,
                "value": value,
                "description": f"Оценка фактора {label.lower()}"
            })
        summary = (
            f"Анализ проекта {project.name}. "
            f"Уровень риска: {project.risk}. "
            f"Всего событий: {total_events}, негативных: {negative_count}."
        )

        return json_response({
            "project_id": project.id,
            "project_name": project.name,
            "risk_level": risk_level,
            "score": score,
            "summary": summary,
            "metrics": {
                "total_events": total_events,
                "negative_events": negative_count,
                "positive_events": sum(1 for n in news_items if n.sentiment == "positive"),
                "neutral_events": sum(1 for n in news_items if n.sentiment == "neutral"),
            },
            "drivers": drivers,
            "recent_news": [n.to_dict() for n in news_items[-5:]],
            "model_version": "db-1.0",
            "analyzed_at": datetime.now().isoformat(),
        }), 200
    except Exception as e:
        return error_response(str(e), 400)


@app.get("/overview")
@db_session_wrapper
def overview(db_sess):
    try:
        projects_total = db_sess.query(Project).count()
        critical_projects = db_sess.query(Project).filter(
            Project.risk.in_(RISK_MAP["RED"] + RISK_MAP["YELLOW"])
        ).count()
        events_today = db_sess.query(News).filter(
            News.date == datetime.now().date()
        ).count()

        recent_events = db_sess.query(News).order_by(News.date.desc()).limit(5).all()
        favorites = db_sess.query(Project).limit(5).all()
        risk_distribution = {
            "RED": db_sess.query(Project).filter(Project.risk.in_(RISK_MAP["RED"])).count(),
            "YELLOW": db_sess.query(Project).filter(Project.risk.in_(RISK_MAP["YELLOW"])).count(),
            "GREEN": db_sess.query(Project).filter(Project.risk.in_(RISK_MAP["GREEN"])).count(),
        }

        return json_response({
            "statistics": {
                "projects_total": projects_total,
                "critical_projects": critical_projects,
                "events_today": events_today,
                "sources_online": 126,
            },
            "risk_distribution": risk_distribution,
            "favorites": favorites,
            "recent_events": recent_events,
        }), 200
    except Exception as e:
        return error_response(str(e), 500)


@app.get("/search/<table>")
@db_session_wrapper
def search(db_sess, table):
    """Search across projects and news.

    Query Parameters:
    - q: search query (required)
    - stype: search by a specific type (required)
    - limit: max results - default: 20"""
    try:
        query_string = request.args.get("q")
        stype = request.args.get("stype")
        limit = request.args.get("limit", 20, type=int)
        if not query_string:
            return error_response("Search query is required", 400)
        if not stype:
            return error_response("Specific type is required", 400)

        results = db_sess.query(db.TABLES[table]).filter(
            func.lower(getattr(db.TABLES[table], stype)).contains(
                query_string.lower())).limit(limit).all()
        results = [n.to_dict() for n in results]

        return json_response(results), 200
    except Exception as e:
        return error_response(str(e), 400)


@app.errorhandler(404)
def not_found(e):
    return error_response("Endpoint not found", 404)


@app.errorhandler(500)
def server_error(e):
    return error_response("Internal server error", 500)


if __name__ == "__main__":
    app.run(host=os.getenv("API_HOST", "0.0.0.0"),
            port=int(os.getenv("API_PORT", 8000)))
