import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from auth import router as auth_router
from database import init_db_pool, close_db_pool, get_db_connection, return_db_connection
from games import router as games_router
from telemetry import setup_telemetry

load_dotenv()

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DIST_DIR = BASE_DIR / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_telemetry()
    try:
        init_db_pool()
    except Exception:
        logger.exception("Database pool initialization failed — DB-dependent endpoints will be unavailable")
    yield
    close_db_pool()


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

app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(games_router, prefix="/api", tags=["Games"])


@app.get("/api/health")
async def health_check():
    return {
        "status": "OK",
        "timestamp": datetime.now().isoformat(),
        "service": "ai-game-hub",
    }


@app.get("/api/test-db")
async def test_database():
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            return {"status": "Database not configured", "timestamp": datetime.now().isoformat()}
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users")
        user_count = cursor.fetchone()[0]
        cursor.close()
        return {
            "status": "Database connected",
            "userCount": user_count,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        logger.exception("Database test failed")
        return {"status": "Database error", "error": str(e), "timestamp": datetime.now().isoformat()}
    finally:
        if conn:
            return_db_connection(conn)


# Catch-all: serve React app for all non-API routes
@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
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
