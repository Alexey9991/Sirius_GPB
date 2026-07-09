from functools import wraps

from flask import Flask, jsonify, request
from flask_cors import CORS
from sqlalchemy import func

import db


app = Flask(__name__)
app.config.update(API_TITLE="Risk Intelligence API", JSON_SORT_KEYS=False)
CORS(app, resources={r"/api/*": {"origins": "*"}, r"/health": {"origins": "*"}},
     methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type"], supports_credentials=False)

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
@app.get("/api/health")
def health():
    try:
        return {"status": "ok"}, 200
    except Exception as e:
        return {"status": "error", "error": str(e)}, 500


@app.get("/api/search/<table>")
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)