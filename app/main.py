from flask import Flask, render_template, abort
import os

app = Flask(__name__, template_folder=os.path.join(os.path.dirname(__file__), "templates"),
            static_folder=os.path.join(os.path.dirname(__file__), "static"))

@app.route("/", defaults={"filename": "index.html"})
@app.route("/<filename>")
def serve_html(filename):
    template_path = os.path.join(app.template_folder, filename)
    if os.path.exists(template_path) and filename.endswith(".html"):
        return render_template(filename)
    else:
        abort(404)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)