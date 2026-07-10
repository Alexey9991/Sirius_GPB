from flask import Flask, render_template, abort
import os


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
        template_name,
        initial_route=PAGE_ROUTES[template_name],
        use_mock=os.getenv("USE_MOCK_API", "true").lower() in {"1", "true", "yes", "on"},
        api_base_url=os.getenv("API_BASE_URL", ""),
    )


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