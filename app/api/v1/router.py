from fastapi import APIRouter

from app.api.v1.endpoints import health
from app.api.v1.endpoints import login
from app.api.v1.endpoints import videoEasyMode
from app.api.v1.endpoints import imageGeneration

api_router = APIRouter()

api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(login.router, prefix="/login", tags=["auth"])
api_router.include_router(videoEasyMode.router, prefix="/videos/easy-mode", tags=["videos"])
api_router.include_router(imageGeneration.router, prefix="/generateImage", tags=["images"])