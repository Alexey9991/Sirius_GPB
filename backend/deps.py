from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database.engine import session_maker


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with session_maker() as sess:
        yield sess


DbSess = Annotated[AsyncSession, Depends(get_session)]