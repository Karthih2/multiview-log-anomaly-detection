"""FastAPI application entry point: ``uvicorn app.main:app`` from the backend folder."""
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analysis, events, runs, system
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import init_db
from app.services.runs import fail_interrupted_runs


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_logging()
    init_db()
    fail_interrupted_runs()
    # Build the full-log chart in the background; startup does not wait for it.
    threading.Thread(target=events.warm_score_cache, name="warm-score-cache", daemon=True).start()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware, allow_origins=settings.cors_origins,
            allow_methods=["*"], allow_headers=["*"])
    for module in (system, runs, events, analysis):
        app.include_router(module.router, prefix=settings.api_prefix)
    return app


app = create_app()
