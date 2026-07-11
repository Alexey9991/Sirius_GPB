from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select, func
from fastapi import FastAPI, Depends, HTTPException
from typing import Annotated

from config.settings import settings
from database.engine import get_session
from database import TABLES


app = FastAPI()

@app.get("/health")
async def health() -> str:
    try:
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(500, {"status": "error", "error": str(e)})


@app.get("/api/get/{table}")
async def get_user(table: str, db_sess: Annotated[AsyncSession, Depends(get_session)], limit: int=30):
    if table in settings.FORBIDDEN_TABLES:
        raise HTTPException(403, {"error": f'This table "{table}" is forbidden in API'})
    table = TABLES[table]
    stmt = select(table).limit(limit)
    result = await db_sess.execute(stmt)
    return result.scalars().all()


@app.get("/api/search/{table}")
async def search(table: str, q: str, stype: str, db_sess: Annotated[AsyncSession, Depends(get_session)], limit: int=30):
    if not q:
        raise HTTPException(400, {"error": "Search query is required"})
    if not stype:
        raise HTTPException(400, {"error": "Specific type is required"})
    if table in settings.FORBIDDEN_TABLES:
        raise HTTPException(403, {"error": f'This table "{table}" is forbidden in API'})
    stmt = select(TABLES[table]).filter(func.lower(
        getattr(TABLES[table], stype)).contains(q.lower())).limit(limit)
    result = await db_sess.execute(stmt)
    return result.scalars().all()