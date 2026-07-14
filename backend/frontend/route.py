from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

HERE = Path(__file__).parent
TEMPLATES_DIR = HERE / "templates"

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
router = APIRouter()


def _template_name(template: str) -> Path | None:
    candidate = TEMPLATES_DIR / template
    return candidate if candidate.is_file() else None


@router.get("/", response_class=HTMLResponse)
@router.get("/index.html", response_class=HTMLResponse)
async def serve_index(request: Request):
    return _render(request, "index.html")


@router.get("/{page}.html", response_class=HTMLResponse)
async def serve_page(request: Request, page: str):
    template = f"{page}.html"
    if _template_name(template):
        return _render(request, template)
    raise HTTPException(status_code=404)


def _render(request: Request, template: str) -> HTMLResponse:
    page = template.removesuffix(".html")
    return templates.TemplateResponse(
        request=request,
        name=template,
        context={
            "request": request,
            "initial_route": page,
            "use_mock": False,
            "api_base_url": "",
        },
    )
