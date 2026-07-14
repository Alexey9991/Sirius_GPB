from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from pathlib import Path

import api
from frontend.route import router as frontend_router
from database.engine import engine


app = FastAPI()
app.include_router(api.router)
app.include_router(frontend_router)

app.mount("/static", StaticFiles(directory=str(
    Path(__file__).parent / "frontend" / "static")), name="static")


@app.get("/health")
async def health():
    try:
        db_status = "ok"
        db_error = None
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception as e:
            db_status = "error"
            db_error = str(e)
        return {
            "status": "ok",
            "database": {
                "status": db_status,
                "error": db_error
            }
        }
    except Exception as e:
        raise HTTPException(500, {"status": "error", "error": str(e)})