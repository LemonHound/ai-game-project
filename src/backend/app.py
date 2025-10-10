from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from contextlib import asynccontextmanager
import os
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime
import uvicorn

from database import init_db_pool, close_db_pool, get_db_connection, return_db_connection
from auth import router as auth_router
from games import router as games_router

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db_pool()
    yield
    close_db_pool()

app = FastAPI(
    title="AI Game Hub",
    description="AI-powered gaming platform",
    version="1.0.0",
    lifespan=lifespan
)

# Setup paths
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "frontend" / "public"
TEMPLATES_DIR = BASE_DIR / "frontend" / "templates"

# Mount static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Setup Jinja2 templates
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv('FRONTEND_URL', 'http://localhost:8000')],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "X-CSRF-Token"],
    expose_headers=["Set-Cookie"],
)

# Include API routers
app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(games_router, prefix="/api", tags=["Games"])

# ============================================
# PAGE ROUTES
# ============================================

@app.get("/")
async def home(request: Request):
    """Landing page"""
    conn = None
    try:
        # Get active games from database
        conn = get_db_connection()
        active_games = []

        if conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, name, description, icon, difficulty, status FROM games WHERE status = 'active'"
            )
            rows = cursor.fetchall()
            cursor.close()

            active_games = [{
                'id': row[0],
                'name': row[1],
                'description': row[2],
                'icon': row[3],
                'difficulty': row[4],
                'status': row[5]
            } for row in rows]

        return templates.TemplateResponse(
            "index.html",
            {
                "request": request,
                "title": "AI Game Hub - Play Games with Adaptive AI",
                "active_games": active_games
            }
        )
    finally:
        if conn:
            return_db_connection(conn)

@app.get("/profile")
async def profile(request: Request):
    """User profile page"""
    return templates.TemplateResponse(
        "profile.html",
        {
            "request": request,
            "title": "Profile - AI Game Hub"
        }
    )

@app.get("/settings")
async def settings(request: Request):
    """User settings page"""
    return templates.TemplateResponse(
        "settings.html",
        {
            "request": request,
            "title": "Settings - AI Game Hub"
        }
    )

@app.get("/games")
async def games_page(request: Request):
    """Games listing page"""
    return templates.TemplateResponse(
        "games.html",
        {
            "request": request,
            "title": "Games - AI Game Hub"
        }
    )

@app.get("/about")
async def about(request: Request):
    """About page"""
    return templates.TemplateResponse(
        "about.html",
        {
            "request": request,
            "title": "About - AI Game Hub"
        }
    )

@app.get("/game/tic-tac-toe")
async def tic_tac_toe(request: Request):
    """Tic-Tac-Toe game page"""
    return templates.TemplateResponse(
        "tic-tac-toe.html",
        {
            "request": request,
            "title": "Tic-Tac-Toe - AI Game Hub"
        }
    )

@app.get("/game/dots-and-boxes")
async def dots_and_boxes(request: Request):
    """Dots and Boxes game page"""
    return templates.TemplateResponse(
        "dots-and-boxes.html",
        {
            "request": request,
            "title": "Dots and Boxes - AI Game Hub"
        }
    )

@app.get("/game/chess")
async def chess(request: Request):
    """Chess game page"""
    return templates.TemplateResponse(
        "chess.html",
        {
            "request": request,
            "title": "Chess - AI Game Hub"
        }
    )

@app.get("/game/connect4")
async def connect4(request: Request):
    """Connect 4 game page"""
    return templates.TemplateResponse(
        "connect4.html",
        {
            "request": request,
            "title": "Connect 4 - AI Game Hub"
        }
    )

# ============================================
# API ROUTES
# ============================================

@app.get("/api/health")
async def health_check():
    return {
        "status": "OK",
        "message": "Python server is running!",
        "timestamp": datetime.now().isoformat(),
        "service": "python-backend"
    }

@app.get("/api/test-db")
async def test_database():
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            return {
                "status": "Database not configured",
                "timestamp": datetime.now().isoformat()
            }

        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users")
        user_count = cursor.fetchone()[0]
        cursor.close()

        return {
            "status": "Database connected!",
            "userCount": user_count,
            "timestamp": datetime.now().isoformat(),
            "database": os.getenv('DB_NAME')
        }
    except Exception as e:
        return {
            "status": "Database error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
    finally:
        if conn:
            return_db_connection(conn)

if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )