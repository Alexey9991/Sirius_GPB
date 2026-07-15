from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.routers.account import AuthSess
from database import Auth, City, Developer, Project
from database.engine import DbSess
from domrf import DomRfClient, DomRfClientError


domrf_router = APIRouter(prefix="/domrf")


class DomRfSyncRequest(BaseModel):
    object_ids: list[int]


def _require_auth(auth: AuthSess) -> None:
    if not isinstance(auth, Auth):
        raise HTTPException(*auth)


@domrf_router.get("/object/{object_id}")
async def get_domrf_object(
    object_id: int,
    auth: AuthSess,
    db_sess: DbSess,
    sync: bool = False,
):
    if sync:
        _require_auth(auth)
    try:
        payload = await DomRfClient().get_object(object_id)
    except DomRfClientError as exc:
        raise HTTPException(502, str(exc)) from exc

    if sync:
        payload["project"] = await _sync_project_from_domrf(db_sess, payload["object"])
    return payload


@domrf_router.post("/objects/sync")
async def sync_domrf_objects(data: DomRfSyncRequest, auth: AuthSess, db_sess: DbSess):
    _require_auth(auth)
    client = DomRfClient()
    synced = []
    errors = []
    for object_id in data.object_ids:
        try:
            payload = await client.get_object(object_id)
            project = await _sync_project_from_domrf(db_sess, payload["object"])
            synced.append({"object_id": object_id, "project": project})
        except Exception as exc:
            await db_sess.rollback()
            errors.append({"object_id": object_id, "error": str(exc)})
    return {"synced": synced, "errors": errors}


@domrf_router.get("/probe/{object_id}")
async def probe_domrf_object(object_id: int, auth: AuthSess):
    return await DomRfClient().probe_object(object_id)


async def _sync_project_from_domrf(db_sess: AsyncSession, data: dict) -> dict:
    city_name = data.get("city") or data.get("region") or "Не указан"
    developer_name = data.get("developer_name") or "Не указан"
    project_name = data.get("name") or f"Дом.РФ объект {data['domrf_object_id']}"

    city = await _get_or_create_city(db_sess, city_name)
    developer = await _get_or_create_developer(db_sess, developer_name)

    project_id = f"domrf:{data['domrf_object_id']}"
    project = await db_sess.get(Project, project_id)
    if project is None:
        project = Project(id=project_id, name=project_name)
        db_sess.add(project)

    project.name = project_name
    project.city_id = city.id
    project.developer_id = developer.id
    await db_sess.commit()
    await db_sess.refresh(project)

    return {
        "id": project.id,
        "name": project.name,
        "city": city.name,
        "developer": developer.name,
    }


async def _get_or_create_city(db_sess: AsyncSession, name: str) -> City:
    stmt = select(City).where(City.name == name)
    city = (await db_sess.execute(stmt)).scalars().first()
    if city:
        return city
    city = City(name=name)
    db_sess.add(city)
    await db_sess.flush()
    return city


async def _get_or_create_developer(db_sess: AsyncSession, name: str) -> Developer:
    stmt = select(Developer).where(Developer.name == name)
    developer = (await db_sess.execute(stmt)).scalars().first()
    if developer:
        return developer
    developer = Developer(name=name)
    db_sess.add(developer)
    await db_sess.flush()
    return developer
