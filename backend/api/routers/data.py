from fastapi import APIRouter, Request, HTTPException
from sqlalchemy import select, func, and_

from config.settings import settings
from api.routers.account import AuthSess
from database.engine import DbSess
from database import *


def table_is_valid(table_name: str, is_auth: bool=False) -> bool:
    try:
        user_id_attr = getattr(TABLES[table_name], "id" if table_name == "users" else "user_id")
    except:
        user_id_attr = None
    if table_name in settings.FORBIDDEN_TABLES and not (is_auth and user_id_attr):
        raise HTTPException(403, f'This table "{table_name}" is forbidden in API.')
    if table_name not in TABLES.keys():
        raise HTTPException(404, f'The "{table_name}" table was not found.')
    return user_id_attr or True


data_router = APIRouter(prefix="/data")


@data_router.get("/get/{table}")
async def get_user(table: str, auth: AuthSess, db_sess: DbSess, limit: int=30):
    user_id_attr = table_is_valid(table, isinstance(auth, Auth))
    stmt = select(TABLES[table])
    stmt = stmt.where(user_id_attr == auth.user_id) if table in settings.FORBIDDEN_TABLES else stmt
    result = (await db_sess.execute(stmt.limit(limit))).scalars()
    return result.all()


@data_router.get("/search/{table}")
async def search(table: str, q: str, stype: str, auth: AuthSess, db_sess: DbSess, limit: int=30):
    user_id_attr = table_is_valid(table, isinstance(auth, Auth))
    stmt = select(TABLES[table]).filter(func.lower(
        getattr(TABLES[table], stype)).contains(q.lower())).limit(limit)
    stmt = stmt.where(user_id_attr == auth.user_id) if table in settings.FORBIDDEN_TABLES else stmt
    result = (await db_sess.execute(stmt)).scalars()
    return result.all()


@data_router.route("/subscriptions", ["PUT", "DELETE"])
async def put_alert(type: str, item_id: int | str, request: Request, auth: AuthSess, db_sess: DbSess):
    try:
        if request.method == "PUT":
            subs = Subscription(user_id=auth.user_id, type=type, item_id=item_id)
            await db_sess.add(subs)
            await db_sess.flush()
            response = subs
        elif request.method == "DELETE":
            stmt = select(Subscription).where(and_(
                Subscription.user_id == auth.user_id,
                Subscription.type == type, Subscription.item_id == item_id))
            subscription = (await db_sess.execute(stmt)).scalars().first()
            await db_sess.delete(subscription)
            response = "Subscription deleted."
        await db_sess.commit()
        return response
    except:
        await db_sess.rollback()
        raise HTTPException(*auth)


@data_router.delete("/alerts")
async def delete_alerts(auth: AuthSess, db_sess: DbSess):
    try:
        stmt = select(Alert).join(Alert.subscription).filter(Subscription.user_id == auth.user_id)
        user_alerts = (await db_sess.execute(stmt)).scalars().all()
        for alert in user_alerts:
            await db_sess.delete(alert)
        await db_sess.commit()
        return "Alerts deleted."
    except:
        await db_sess.rollback()
        raise HTTPException(*auth)