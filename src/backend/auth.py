import logging
import os
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Cookie, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from opentelemetry import trace
from pydantic import BaseModel, EmailStr
import secrets

from auth_service import AuthService

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)

router = APIRouter()
auth_service = AuthService()
csrf_tokens: dict = {}


class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    displayName: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    rememberMe: Optional[bool] = False


class LogoutRequest(BaseModel):
    sessionId: Optional[str] = None


def _is_production() -> bool:
    return os.getenv("ENVIRONMENT") == "production"


def set_session_cookie(response: Response, session_id: str, max_age: int = 7 * 24 * 60 * 60):
    response.set_cookie(
        key="sessionId",
        value=session_id,
        httponly=True,
        secure=_is_production(),
        samesite="lax",
        max_age=max_age,
        path="/",
    )


def delete_session_cookie(response: Response):
    response.delete_cookie(
        key="sessionId",
        path="/",
        domain=None,
        secure=_is_production(),
        httponly=True,
        samesite="lax",
    )
    response.set_cookie(key="sessionId", value="", max_age=0, path="/")


@router.get("/csrf-token")
async def get_csrf_token(response: Response):
    token = secrets.token_urlsafe(32)
    csrf_tokens[token] = datetime.now()
    response.set_cookie(
        key="csrf_token",
        value=token,
        httponly=True,
        secure=_is_production(),
        samesite="strict",
    )
    return {"csrfToken": token}


@router.get("/me")
async def get_current_user(
    response: Response,
    sessionId: Optional[str] = Cookie(None),
    x_session_id: Optional[str] = None,
):
    session_id = sessionId or x_session_id
    if not session_id:
        raise HTTPException(status_code=401, detail="No session provided")

    user = await auth_service.get_user_by_session(session_id)
    if not user:
        delete_session_cookie(response)
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    await auth_service.update_last_login(user["id"])

    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "displayName": user["display_name"],
        "profilePicture": user.get("profile_picture"),
        "authProvider": user["auth_provider"],
        "emailVerified": user.get("email_verified", False),
        "lastLogin": user.get("last_login"),
    }


@router.get("/stats")
async def get_user_stats():
    return {"gamesPlayed": 0, "winRate": 0, "aiContributions": 0}


@router.post("/register")
async def register(request: RegisterRequest, response: Response):
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")
    if len(request.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters long")

    with tracer.start_as_current_span("auth.register") as span:
        span.set_attribute("auth.username", request.username)

        existing_email = await auth_service.find_user_by_email(request.email)
        if existing_email:
            raise HTTPException(status_code=409, detail="Email already registered")

        existing_username = await auth_service.find_user_by_username(request.username)
        if existing_username:
            raise HTTPException(status_code=409, detail="Username already taken")

        try:
            user = await auth_service.create_user(
                username=request.username,
                email=request.email,
                password=request.password,
                display_name=request.displayName or request.username,
            )
            session_id = await auth_service.create_session(user["id"])
            set_session_cookie(response, session_id)
            span.set_attribute("auth.user_id", user["id"])
            return {
                "message": "User registered successfully",
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"],
                    "displayName": user["display_name"],
                    "authProvider": user["auth_provider"],
                },
            }
        except HTTPException:
            raise
        except Exception:
            logger.exception("Registration failed for username=%s", request.username)
            raise HTTPException(status_code=500, detail="Registration failed. Please try again.")


@router.post("/login")
async def login(request: LoginRequest, response: Response):
    with tracer.start_as_current_span("auth.login") as span:
        span.set_attribute("auth.method", "local")

        user = await auth_service.find_user_by_email(request.email)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if user["auth_provider"] == "local" and user.get("password_hash"):
            if not await auth_service.verify_password(request.password, user["password_hash"]):
                raise HTTPException(status_code=401, detail="Invalid email or password")
        else:
            raise HTTPException(status_code=401, detail="Please use Google Sign-In for this account")

        session_id = await auth_service.create_session(user["id"])
        max_age = 30 * 24 * 60 * 60 if request.rememberMe else 7 * 24 * 60 * 60
        set_session_cookie(response, session_id, max_age=max_age)
        await auth_service.update_last_login(user["id"])
        span.set_attribute("auth.user_id", user["id"])

        return {
            "message": "Login successful",
            "user": {
                "id": user["id"],
                "username": user["username"],
                "email": user["email"],
                "displayName": user["display_name"],
                "profilePicture": user.get("profile_picture"),
                "authProvider": user["auth_provider"],
            },
        }


@router.post("/logout")
async def logout(
    response: Response,
    request: LogoutRequest = None,
    sessionId: Optional[str] = Cookie(None),
    x_session_id: Optional[str] = None,
):
    session_id = sessionId or x_session_id or (request.sessionId if request else None)
    if session_id:
        await auth_service.delete_session(session_id)
    delete_session_cookie(response)
    return {"message": "Logout successful"}


@router.get("/health")
async def auth_health():
    db_status = await auth_service.check_database()
    return {
        "auth": "OK",
        "database": db_status,
        "timestamp": datetime.now().isoformat(),
    }


class GoogleAuthRequest(BaseModel):
    token: str


@router.post("/google")
async def google_auth(request: GoogleAuthRequest, response: Response):
    with tracer.start_as_current_span("auth.google") as span:
        try:
            client_id = os.getenv("GOOGLE_CLIENT_ID")
            if not client_id:
                raise HTTPException(status_code=501, detail="Google OAuth not configured")

            idinfo = id_token.verify_oauth2_token(
                request.token, google_requests.Request(), client_id
            )

            email = idinfo["email"]
            google_id = idinfo["sub"]
            span.set_attribute("auth.method", "google")

            user = await auth_service.find_user_by_email(email)
            if not user:
                user = await auth_service.create_google_user(
                    email=email,
                    google_id=google_id,
                    display_name=idinfo.get("name", ""),
                    profile_picture=idinfo.get("picture", ""),
                )

            session_id = await auth_service.create_session(user["id"])
            set_session_cookie(response, session_id, max_age=30 * 24 * 60 * 60)
            await auth_service.update_last_login(user["id"])
            span.set_attribute("auth.user_id", user["id"])

            return {
                "message": "Login successful",
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"],
                    "displayName": user["display_name"],
                    "profilePicture": user.get("profile_picture"),
                    "authProvider": "google",
                },
            }
        except HTTPException:
            raise
        except Exception:
            logger.exception("Google token auth failed")
            raise HTTPException(status_code=401, detail="Google authentication failed")


@router.get("/google")
async def google_login(redirect_to: str = "/"):
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback")
    google_auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={client_id}&"
        f"redirect_uri={redirect_uri}&"
        "scope=email profile&"
        "response_type=code&"
        "access_type=offline&"
        "prompt=select_account&"
        f"state={redirect_to}"
    )
    return RedirectResponse(url=google_auth_url)


@router.get("/google/callback")
async def google_callback(code: str = None, error: str = None, state: str = "/"):
    with tracer.start_as_current_span("auth.google_callback"):
        try:
            if error or not code:
                return RedirectResponse(url=f"{state}?error=google_auth_failed")

            redirect_uri = os.getenv(
                "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback"
            )
            async with httpx.AsyncClient() as client:
                token_response = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                        "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
                        "code": code,
                        "grant_type": "authorization_code",
                        "redirect_uri": redirect_uri,
                    },
                )
                tokens = token_response.json()

            if not tokens.get("access_token"):
                return RedirectResponse(url=f"{state}?error=google_auth_failed")

            async with httpx.AsyncClient() as client:
                user_response = await client.get(
                    "https://www.googleapis.com/oauth2/v2/userinfo",
                    headers={"Authorization": f"Bearer {tokens['access_token']}"},
                )
                google_user = user_response.json()

            user = await auth_service.find_user_by_email(google_user["email"])
            if not user:
                user = await auth_service.create_google_user(
                    email=google_user["email"],
                    google_id=google_user["id"],
                    display_name=google_user.get("name", ""),
                    profile_picture=google_user.get("picture", ""),
                )
            else:
                await auth_service.update_last_login(user["id"])

            session_id = await auth_service.create_session(user["id"])
            redirect_response = RedirectResponse(url=f"{state}?login=success&provider=google")
            set_session_cookie(redirect_response, session_id, max_age=30 * 24 * 60 * 60)
            return redirect_response

        except Exception:
            logger.exception("Google OAuth callback failed")
            return RedirectResponse(url=f"{state}?error=google_auth_failed")
