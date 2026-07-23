from fastapi import Depends, HTTPException, Request
from fastapi.responses import Response
from fastapi import APIRouter
from sqlalchemy import select, or_
from typing import Annotated, Tuple
from datetime import datetime

from api.schemas import sign_schema
from deps import DbSess
from database import *


async def get_auth_session(request: Request, db_sess: DbSess) -> Auth | Tuple[int, str]:
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

AuthSess = Annotated[Auth, Depends(get_auth_session)]


account_router = APIRouter(prefix="/account")


@account_router.post("/sign/{form_type}")
async def sign(form_type: str, data: dict, request: Request, db_sess: DbSess):
    if form_type == "login":
        login_data = sign_schema.LoginRequest(**data)
        stmt = select(User).filter(User.name == login_data.username)
        user = (await db_sess.execute(stmt)).scalars().first()
        if not (user and user.check_password(login_data.password)):
            raise HTTPException(403, "Неверное имя пользователя или пароль")

    elif form_type == "register":
        reg_data = sign_schema.RegisterRequest(**data)
        if not reg_data.policy_check:
            raise HTTPException(403, "Подтвердите соглашение с условиями использования!")
        if reg_data.password != reg_data.password_again:
            raise HTTPException(409, "Введённые пароли не совпадают!")
        stmt = select(User).filter(
            or_(User.name == reg_data.username, User.email == reg_data.email))
        old_user = (await db_sess.execute(stmt)).scalars().first()
        if old_user:
            raise HTTPException(409, "Данный email уже занят." 
                                if old_user.email == reg_data.email
                                else "Такой пользователь уже существует.")
        user = User(name=reg_data.username, email=reg_data.email,
                    role=reg_data.role, division=reg_data.division)
        user.set_password(reg_data.password)
        db_sess.add(user)
        await db_sess.flush()

    else:
        raise HTTPException(400, f"Unknown type of form: {form_type}")

    auth = Auth(user_id=user.id, user_agent=request.headers.get("user-agent"))
    db_sess.add(auth)
    await db_sess.commit()
    await db_sess.refresh(auth)
    response = Response("Successful login.", status_code=200)
    response.set_cookie(key="session_token", value=auth.session_token, httponly=True,
                        samesite="lax", max_age=60 * 60 * 24 * 30)
    return response


@account_router.get("/")
async def who_am_i(auth: AuthSess):
    if isinstance(auth, Auth):
        return auth
    else:
        raise HTTPException(*auth)


@account_router.post("/edit")
async def edit(data: dict, auth: AuthSess, db_sess: DbSess):
    try:
        reg_data = sign_schema.RegisterRequest(**data)
        stmt = select(User).filter(User.id == auth.user_id)
        user = (await db_sess.execute(stmt)).scalars().first()
        user.name = reg_data.username or user.name
        user.email = reg_data.email or user.email
        user.role = reg_data.role or user.role
        user.division = reg_data.division or user.division
        await db_sess.commit()
    except Exception as e:
        await db_sess.rollback()
        if isinstance(auth, tuple):
            raise HTTPException(*auth)
        else:
            raise HTTPException(500, e)


@account_router.delete("/logout")
async def logout(auth: AuthSess, db_sess: DbSess):
    try:
        auth.logout_at = auth.last_activity
        await db_sess.commit()
        response = Response("Successful exit.", status_code=200)
        response.delete_cookie("session_token")
        return response
    except Exception as e:
        await db_sess.rollback()
        if isinstance(auth, tuple):
            raise HTTPException(*auth)
        else:
            raise HTTPException(500, e)


@account_router.delete("/")
async def delete(auth: AuthSess, db_sess: DbSess):
    try:
        stmt = select(User).filter(User.id == auth.user_id)
        user = (await db_sess.execute(stmt)).scalars().first()
        await db_sess.delete(user)
        await db_sess.commit()
        response = Response("Account successfuly deleted.", status_code=200)
        response.delete_cookie("session_token")
        return response
    except Exception as e:
        await db_sess.rollback()
        if isinstance(auth, tuple):
            raise HTTPException(*auth)
        else:
            raise HTTPException(500, e)