import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.services.mongo_client import MongoClientManager
from app.api.v1.router import api_router

# Carga .env antes de leer variables
load_dotenv()

MONGO_DB_URI = os.getenv("MONGO_DB_URI", "")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "zumidb")


def _configure_logging() -> None:
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def _parse_cors_origins(value: str | None) -> list[str]:
    if not value:
        return [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]

    if value.strip() == "*":
        return ["*"]

    return [origin.strip() for origin in value.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Opcional: recarga .env si LOAD_DOTENV lo permite
    if os.getenv("LOAD_DOTENV", "true").lower() in {"1", "true", "yes", "on"}:
        try:
            load_dotenv(override=False)
        except Exception:
            pass

    _configure_logging()
    logger = logging.getLogger("app")

    if not getattr(app.state, "initialized", False):
        logger.info("Initializing application state")
        app.state.initialized = True

    # Conexión a Mongo al inicio
    if not MONGO_DB_URI:
        raise RuntimeError("MONGO_DB_URI missing")
    app.state.db = MongoClientManager.get_database(MONGO_DB_URI, MONGO_DB_NAME)
    logger.info("MongoDB connected")

    logger.info("Application startup")
    try:
        yield
    finally:
        logger.info("Application shutdown")


def create_app() -> FastAPI:
    app = FastAPI(title="getzumi.ai API", version="0.1.0", lifespan=lifespan)

    cors_allow_origins = _parse_cors_origins(os.getenv("CORS_ALLOW_ORIGINS"))
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api/v1")
    return app


app = create_app()