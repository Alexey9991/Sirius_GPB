from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from sqlalchemy import text
from pathlib import Path

import api
from frontend.route import router as frontend_router
from database.engine import engine, engine_sync, session_maker_sync
from database import SQLBase, User


def _prepare_database() -> None:
    """Схема + мини-миграция + демо-пользователь (идемпотентно)."""
    SQLBase.metadata.create_all(engine_sync)
    with engine_sync.begin() as conn:
        # база, восстановленная из дампа pg_dump, не знает про новую колонку
        conn.execute(text(
            "ALTER TABLE impact_signals ADD COLUMN IF NOT EXISTS risk_category VARCHAR"))
    with session_maker_sync() as sess:
        demo = sess.query(User).filter(User.name == "demo").first()
        if not demo:
            demo = User(name="demo", email="demo@gpb.local",
                        role="Аналитик рисков", division="Проектное финансирование")
            demo.set_password("demo1234")
            sess.add(demo)
            sess.commit()
            print("✓ Демо-пользователь: demo / demo1234")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _prepare_database()
    yield


app = FastAPI(lifespan=lifespan)
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