from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy import create_engine
from collections.abc import AsyncGenerator
from fastapi import Depends
from typing import Annotated

from config.settings import settings


engine: AsyncEngine = create_async_engine(settings.database.database_url)
engine_sync = create_engine(settings.database.database_url_sync)
session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
session_maker_sync = sessionmaker(engine_sync, class_=Session, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with session_maker() as sess:
        yield sess


DbSess = Annotated[AsyncSession, Depends(get_session)]