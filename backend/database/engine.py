from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends
from typing import Annotated

from config.settings import settings


engine: AsyncEngine = create_async_engine(settings.database.database_url)
session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with session_maker() as sess:
        yield sess


DbSess = Annotated[AsyncSession, Depends(get_session)]