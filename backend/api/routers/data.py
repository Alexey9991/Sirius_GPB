from fastapi import HTTPException
from sqlalchemy import select, func
from fastapi import APIRouter

from config.settings import settings
from api.routers.account import AuthSess
from database.engine import DbSess
from database import *


def table_is_valid(table_name: str, is_auth: bool=False) -> bool:
    if table_name in settings.FORBIDDEN_TABLES and not is_auth:
        raise HTTPException(403, f'This table "{table_name}" is forbidden in API')
    if table_name not in TABLES.keys():
        raise HTTPException(404, f'The "{table_name}" table was not found.')
    return True


data_router = APIRouter(prefix="/data")


@data_router.get("/get/{table}")
async def get_user(table: str, auth: AuthSess, db_sess: DbSess, limit: int=30):
    table_is_valid(table, isinstance(auth, Auth))

    stmt = select(TABLES[table])
    if table in settings.FORBIDDEN_TABLES:
        stmt = stmt.where(getattr(TABLES[table], "id" if table == "users" else "user_id") == auth.user_id)
    result = (await db_sess.execute(stmt.limit(limit))).scalars()
    return result.all()


@data_router.get("/search/{table}")
async def search(table: str, q: str, stype: str, auth: AuthSess, db_sess: DbSess, limit: int=30):
    table_is_valid(table, isinstance(auth, Auth))
    if not q:
        raise HTTPException(400, "Search query is required")
    if not stype:
        raise HTTPException(400, "Specific type is required")

    stmt = select(TABLES[table]).filter(func.lower(
        getattr(TABLES[table], stype)).contains(q.lower())).limit(limit)
    result = (await db_sess.execute(stmt)).scalars()
    return result.all()


@data_router.delete("/alerts")
async def delete_alerts(auth: AuthSess, db_sess: DbSess):
    try:
        stmt = select(Alert).join(Alert.subscription).filter(Subscription.user_id == auth.user_id)
        user_alerts = (await db_sess.execute(stmt)).scalars().all()
        for alert in user_alerts:
            await db_sess.delete(alert)
        await db_sess.commit()
        return "Alerts deleted"
    except:
        await db_sess.rollback()
        raise HTTPException(*auth)