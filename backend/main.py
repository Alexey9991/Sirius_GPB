from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime
from typing import Annotated, Tuple

from config.settings import settings
from database.engine import get_session
from schemas import sign_schema
from database import *


# /// setup API ///

app = FastAPI()


@app.get("/health")
async def health():
    try:
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(500, {"status": "error", "error": str(e)})


async def get_auth_session(request: Request, db_sess: Annotated[AsyncSession, Depends(get_session)]) -> Auth | Tuple[int, str]:
    dnow = datetime.datetime.now()
    session_token = request.cookies.get("session_token")
    if not session_token:
        return 401, "Authentication required"

    stmt = select(Auth).filter(Auth.session_token == session_token)
    auth = (await db_sess.execute(stmt)).scalars().first()

    if not auth:
        return 401, "Authentication was not found"
    elif request.headers.get("user-agent") != auth.user_agent and auth.user_agent is not None:
        return 403, "user_agent != Auth.user_agent"
    elif auth.logout_at is not None and dnow > auth.logout_at:
        return 401, "The session was completed."

    auth.last_activity = dnow
    await db_sess.commit()
    return auth


# /// get_base_information from tables ///

def table_is_valid(table_name: str, is_auth: bool=False) -> bool:
    if table_name in settings.FORBIDDEN_TABLES and not is_auth:
        raise HTTPException(403, f'This table "{table_name}" is forbidden in API')
    if table_name not in TABLES.keys():
        raise HTTPException(404, f'The "{table_name}" table was not found.')
    return True


@app.get("/api/get/{table}")
async def get_user(table: str, db_sess: Annotated[AsyncSession, Depends(get_session)],
                   auth: Annotated[Auth, Depends(get_auth_session)], limit: int=30):
    table_is_valid(table, isinstance(auth, Auth))

    stmt = select(TABLES[table])
    if table in settings.FORBIDDEN_TABLES:
        stmt = stmt.where(getattr(TABLES[table], "id" if table == "users" else "user_id") == auth.user_id)
    result = (await db_sess.execute(stmt.limit(limit))).scalars()
    return result.all()


@app.get("/api/search/{table}")
async def search(table: str, q: str, stype: str,
                 db_sess: Annotated[AsyncSession, Depends(get_session)],
                 auth: Annotated[Auth, Depends(get_auth_session)], limit: int=30):
    table_is_valid(table, isinstance(auth, Auth))
    if not q:
        raise HTTPException(400, "Search query is required")
    if not stype:
        raise HTTPException(400, "Specific type is required")

    stmt = select(TABLES[table]).filter(func.lower(
        getattr(TABLES[table], stype)).contains(q.lower())).limit(limit)
    result = (await db_sess.execute(stmt)).scalars()
    return result.all()


# /// authentication ///


@app.post("/api/sign/{form_type}")
async def sign(form_type: str, data: dict, request: Request,
               db_sess: Annotated[AsyncSession, Depends(get_session)]):
    if form_type == "login":
        login_data = sign_schema.LoginRequest(**data)
        stmt = select(User).filter(User.name == login_data.username)
        user = (await db_sess.execute(stmt)).scalars().first()
        if not (user and user.check_password(login_data.password)):
            raise HTTPException(403, "Неверное имя пользователя или пароль")

    elif form_type == "register":
        register_data = sign_schema.RegisterRequest(**data)
        if not register_data.policy_check:
            raise HTTPException(403, "Подтвердите соглашение с условиями использования!")
        if register_data.password != register_data.password_again:
            raise HTTPException(409, "Введённые пароли не совпадают!")
        stmt = select(User).filter(User.name == register_data.username)
        if (await db_sess.execute(stmt)).scalars().first():
            raise HTTPException(409, "Такой пользователь уже существует.")
        user = User(name=register_data.username)
        user.set_password(register_data.password)
        db_sess.add(user)

    else:
        raise HTTPException(400, f"Unknown type of form: {form_type}")

    auth = Auth(user_id=user.id, user_agent=request.headers.get("user-agent"))
    db_sess.add(auth)
    await db_sess.commit()
    await db_sess.refresh(auth)
    response = Response("Successful login.", status_code=200)
    response.set_cookie(
        key="session_token", value=auth.session_token, httponly=True,
        samesite="lax", max_age=60 * 60 * 24 * 30, secure=True)
    return response


@app.get("/api/logout")
async def logout(auth: Annotated[Auth, Depends(get_auth_session)],
                 db_sess: Annotated[AsyncSession, Depends(get_session)]):
    if isinstance(auth, Auth):
        auth.logout_at = auth.last_activity
        await db_sess.commit()
        return "Successful exit."
    else:
        return HTTPException(*auth)


@app.get("/api/who_am_i")
def who_am_i(auth: Annotated[Auth, Depends(get_auth_session)]):
    if isinstance(auth, Auth):
        return auth
    else:
        raise HTTPException(*auth)