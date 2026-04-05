"""Main entry point for the game-ai backend application."""
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from about import router as about_router
from auth import router as auth_router
from db import init_db, close_db
from games import router as games_router
from stats import router as stats_router
from telemetry import setup_telemetry

load_dotenv()

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DIST_DIR = BASE_DIR / "dist"
STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup and shutdown of OTel and database engine.

    Initializes telemetry and the async database engine on startup, then disposes
    the engine on shutdown. Errors in either initialization are logged but do not
    prevent the application from starting.

    Args:
        app: The FastAPI application instance.

    Yields:
        None — control returns to FastAPI between startup and shutdown.
    """
    try:
        setup_telemetry()
    except Exception:
        logger.exception("Telemetry setup failed — observability will be unavailable")
    try:
        init_db()
    except Exception:
        logger.exception("Database initialization failed — DB-dependent endpoints will be unavailable")
    yield
    await close_db()


app = FastAPI(
    title="AI Game Hub",
    description="AI-powered gaming platform",
    version="1.0.0",
    lifespan=lifespan,
)

FastAPIInstrumentor.instrument_app(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("WEBSITE_URL", "http://localhost:8000"),
        "http://localhost:5173",  # Vite dev server
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "X-CSRF-Token"],
    expose_headers=["Set-Cookie"],
)

# Serve Vite build assets (only present after `npm run build`)
if (DIST_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")
if (DIST_DIR / "images").exists():
    app.mount("/images", StaticFiles(directory=str(DIST_DIR / "images")), name="images")

app.include_router(about_router, prefix="/api/about", tags=["About"])
app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(games_router, prefix="/api", tags=["Games"])
app.include_router(stats_router, prefix="/api", tags=["Stats"])


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Return JSON error responses with an optional board_state field for game routes.

    Game API routes (`/api/game/`) include a null `board_state` key so that the
    frontend error handler can read it without a separate null-check.

    Args:
        request: The incoming HTTP request.
        exc: The HTTPException raised by a route handler.

    Returns:
        JSONResponse with `detail` and, for game routes, `board_state: null`.
    """
    content = {"detail": exc.detail}
    if request.url.path.startswith("/api/game/"):
        content["board_state"] = None
    return JSONResponse(status_code=exc.status_code, content=content)


@app.get("/api/health")
async def health_check():
    """Return service liveness status and current timestamp.

    Returns:
        dict: Keys `status` ("OK"), `timestamp` (ISO-8601 string), `service` name.
    """
    return {
        "status": "OK",
        "timestamp": datetime.now().isoformat(),
        "service": "ai-game-hub",
    }



INDEXABLE_PATHS = ["/", "/games", "/about", "/leaderboard"]


@app.get("/robots.txt")
async def robots_txt():
    """Serve the static robots.txt file for search engine crawlers."""
    return FileResponse(str(STATIC_DIR / "robots.txt"), media_type="text/plain")


@app.get("/sitemap.xml")
async def sitemap_xml():
    """Generate and serve a sitemap.xml listing all indexable pages."""
    base_url = os.getenv("WEBSITE_URL", "http://localhost:8000").rstrip("/")
    urls = "\n".join(
        f"  <url><loc>{base_url}{path}</loc></url>" for path in INDEXABLE_PATHS
    )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{urls}\n"
        "</urlset>\n"
    )
    return Response(content=xml, media_type="application/xml")


# Catch-all: serve React app for all non-API routes
@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    """Serve the React SPA index.html for all non-API routes.

    Enables client-side routing: any path not matched by an API router falls through
    to this handler and returns the built index.html. Returns 503 if the frontend
    has not been built yet.

    Args:
        full_path: The unmatched URL path (captured by FastAPI).

    Returns:
        FileResponse for index.html, or raises HTTPException 503 if not built.
    """
    index_path = DIST_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    raise HTTPException(
        status_code=503,
        detail="Frontend not built. Run `npm run build` or use the Vite dev server on port 5173.",
    )


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    is_dev = os.getenv("ENVIRONMENT", "development") == "development"
    uvicorn.run("app:app", host=host, port=port, reload=is_dev)
