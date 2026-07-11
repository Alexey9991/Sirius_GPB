from flask import Flask, render_template, abort, request, Response
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request as BackendRequest, urlopen



app = Flask(__name__, template_folder=os.path.join(os.path.dirname(__file__), "templates"),
            static_folder=os.path.join(os.path.dirname(__file__), "static"))


PAGE_ROUTES = {
    "index.html": "dashboard",
    "dashboard.html": "dashboard",
    "ai-analysis.html": "ai-analysis",
    "projects.html": "projects",
    "news.html": "news",
    "history.html": "history",
    "notifications.html": "notifications",
    "profile.html": "profile",
    "search.html": "search",
    "login.html": "login",
    "register.html": "register",
}

def render_page(template_name):
    return render_template(
        template_name, initial_route=PAGE_ROUTES[template_name],
        use_mock=False, api_base_url=os.getenv("API_BASE_URL", ""))


def backend_url(path):
    default_host = "http://backend:8000" if os.path.exists("/.dockerenv") else "http://localhost:8000"
    host = os.getenv("BACKEND_URL", default_host).rstrip("/")
    query = request.query_string.decode("utf-8")
    return f"{host}/api/{path}{'?' + query if query else ''}"


@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_proxy(path):
    headers = {
        "Accept": request.headers.get("Accept", "application/json"),
        "User-Agent": request.headers.get("User-Agent", "GPB-Risk-Desk"),
    }
    if request.content_type:
        headers["Content-Type"] = request.content_type
    if request.headers.get("Cookie"):
        headers["Cookie"] = request.headers["Cookie"]

    proxy_request = BackendRequest(
        backend_url(path),
        data=request.get_data() or None,
        headers=headers,
        method=request.method,
    )

    try:
        backend_response = urlopen(proxy_request, timeout=30)
    except HTTPError as error:
        backend_response = error
    except URLError as error:
        return {"detail": f"Backend is unavailable: {error.reason}"}, 502

    response = Response(
        backend_response.read(),
        status=backend_response.status,
        content_type=backend_response.headers.get("Content-Type", "application/json"),
    )
    if backend_response.headers.get("Set-Cookie"):
        response.headers["Set-Cookie"] = backend_response.headers["Set-Cookie"]
    return response



@app.route("/")
@app.route("/index.html")
def serve_index():
    return render_page("index.html")


@app.route("/<route_name>.html")
def serve_page(route_name):
    template_name = f"{route_name}.html"
    if template_name in PAGE_ROUTES:
        return render_page(template_name)
    abort(404)


@app.route("/<path:_path>")
def spa_fallback(_path):
    abort(404)



if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
