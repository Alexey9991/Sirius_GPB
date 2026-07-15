from fastapi import APIRouter

from api.routers.account import account_router
from api.routers.data import data_router

router = APIRouter(prefix="/api")
router.include_router(account_router)
router.include_router(data_router)
