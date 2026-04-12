"""Authentication routes for registration, login, logout, and Google OAuth."""
import logging
import os
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Cookie, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from opentelemetry import metrics, trace
from pydantic import BaseModel, EmailStr
import secrets

from sqlalchemy import text

from auth_service import AuthService
from db import get_session

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)
meter = metrics.get_meter(__name__)
_auth_logins = meter.create_counter("auth.logins", description="Successful authentication logins")

router = APIRouter()
auth_service = AuthService()
csrf_tokens: dict = {}


class RegisterRequest(BaseModel):
    """Request body for the /register endpoint."""

    username: str
    email: EmailStr
    password: str
    displayName: Optional[str] = None


class LoginRequest(BaseModel):
    """Request body for the /login endpoint."""

    email: EmailStr
    password: str
    rememberMe: Optional[bool] = False


class LogoutRequest(BaseModel):
    """Request body for the /logout endpoint."""

    sessionId: Optional[str] = None


def _is_production() -> bool:
    return os.getenv("ENVIRONMENT") == "production"


def set_session_cookie(response: Response, session_id: str, max_age: int = 7 * 24 * 60 * 60):
    """Set the httpOnly session cookie on a response.

    Args:
        response: The FastAPI Response object to attach the cookie to.
        session_id: The session UUID string to store in the cookie.
        max_age: Cookie lifetime in seconds (default 7 days).
    """
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
    """Clear the session cookie from a response by deleting and zeroing it.

    Args:
        response: The FastAPI Response object to clear the cookie on.
    """
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
    """Generate and return a CSRF token, also setting it as an httpOnly cookie.

    Returns:
        dict: `{"csrfToken": <token>}`.
    """
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
    """Return the authenticated user's profile, or 401 if the session is invalid.

    Accepts the session from either the sessionId cookie or the X-Session-Id header.
    Updates last_login on every call.

    Returns:
        dict: User profile including id, username, email, displayName, profilePicture,
        authProvider, emailVerified, lastLogin.

    Raises:
        HTTPException 401: If no session is provided or the session is expired/invalid.
    """
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
        "statsPublic": user.get("stats_public", False),
    }


@router.post("/register", status_code=201)
async def register(request: RegisterRequest, response: Response):
    """Register a new local user account and return an authenticated session.

    Validates password length (min 6) and username length (min 3). Returns 409 if
    the email or username is already taken. Sets a session cookie on success.

    Args:
        request: RegisterRequest with username, email, password, and optional displayName.
        response: FastAPI Response used to set the session cookie.

    Returns:
        dict: `{"message": ..., "user": {id, username, email, displayName, authProvider}}`.

    Raises:
        HTTPException 400: Invalid password or username length.
        HTTPException 409: Email or username already registered.
        HTTPException 500: Unexpected registration failure.
    """
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
    """Authenticate a local user by email and password and return a session cookie.

    Args:
        request: LoginRequest with email, password, and optional rememberMe flag.
        response: FastAPI Response used to set the session cookie.

    Returns:
        dict: `{"message": ..., "user": {id, username, email, displayName, profilePicture, authProvider}}`.

    Raises:
        HTTPException 401: Invalid credentials or account uses a different auth provider.
    """
    with tracer.start_as_current_span("auth.login") as span:
        span.set_attribute("auth.method", "local")

        user = await auth_service.find_user_by_email(request.email)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if not user.get("is_active", True):
            raise HTTPException(status_code=401, detail="Account is deactivated")

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
        _auth_logins.add(1, {"auth.method": "local"})

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
    """Delete the user session and clear the session cookie.

    Returns:
        dict: `{"message": "Logout successful"}`.
    """
    session_id = sessionId or x_session_id or (request.sessionId if request else None)
    if session_id:
        await auth_service.delete_session(session_id)
    delete_session_cookie(response)
    return {"message": "Logout successful"}


class SettingsRequest(BaseModel):
    """Request body for the /settings endpoint."""

    statsPublic: Optional[bool] = None
    display_name: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


@router.patch("/settings")
async def update_settings(
    request: SettingsRequest,
    sessionId: Optional[str] = Cookie(None),
):
    """Update user account settings including display name, password, and stats visibility.

    Args:
        request: SettingsRequest with optional statsPublic, display_name, current_password,
            and new_password fields.
        sessionId: Session cookie for authentication.

    Returns:
        dict: Updated statsPublic and displayName values.

    Raises:
        HTTPException 400: If only one of current_password or new_password is provided.
        HTTPException 401: If not authenticated or current_password is incorrect.
        HTTPException 403: If a Google OAuth user attempts a password change.
    """
    if not sessionId:
        raise HTTPException(status_code=401, detail="Authentication required")
    user = await auth_service.get_user_by_session(sessionId)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    if bool(request.current_password) != bool(request.new_password):
        raise HTTPException(
            status_code=400,
            detail="Both current_password and new_password are required to change password",
        )

    updates = {}

    if request.statsPublic is not None:
        updates["stats_public"] = request.statsPublic

    if request.display_name is not None:
        updates["display_name"] = request.display_name

    if request.new_password:
        if user.get("auth_provider") == "google":
            raise HTTPException(
                status_code=403, detail="Google OAuth users cannot set a password"
            )
        if not await auth_service.verify_password(request.current_password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Current password is incorrect")
        updates["password_hash"] = await auth_service.hash_password(request.new_password)

    if updates:
        set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
        params = {**updates, "user_id": user["id"]}
        async with get_session() as session:
            await session.execute(
                text(f"UPDATE users SET {set_clauses} WHERE id = :user_id"),
                params,
            )
            await session.commit()

    return {
        "statsPublic": updates.get("stats_public", user.get("stats_public", False)),
        "displayName": updates.get("display_name", user.get("display_name", "")),
    }


@router.delete("/account")
async def delete_account(
    response: Response,
    sessionId: Optional[str] = Cookie(None),
):
    """Soft-delete the current user's account by setting is_active = false.

    Args:
        response: FastAPI Response used to clear the session cookie.
        sessionId: Session cookie for authentication.

    Returns:
        dict: {"message": "Account deactivated."}

    Raises:
        HTTPException 401: If not authenticated.
    """
    if not sessionId:
        raise HTTPException(status_code=401, detail="Authentication required")
    user = await auth_service.get_user_by_session(sessionId)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    async with get_session() as session:
        await session.execute(
            text("UPDATE users SET is_active = false WHERE id = :user_id"),
            {"user_id": user["id"]},
        )
        await session.commit()

    await auth_service.delete_sessions_by_user_id(user["id"])
    delete_session_cookie(response)
    return {"message": "Account deactivated."}


@router.get("/health")
async def auth_health():
    """Return auth service health including database connectivity status.

    Returns:
        dict: Keys `auth` ("OK"), `database` (connectivity string), `timestamp` (ISO-8601).
    """
    db_status = await auth_service.check_database()
    return {
        "auth": "OK",
        "database": db_status,
        "timestamp": datetime.now().isoformat(),
    }


class GoogleAuthRequest(BaseModel):
    """Request body carrying a Google ID token for OAuth sign-in."""

    token: str


@router.post("/google")
async def google_auth(request: GoogleAuthRequest, response: Response):
    """Verify a Google ID token and return an authenticated session.

    Verifies the token against GOOGLE_CLIENT_ID. Creates a new user if the email
    has not been seen before. Sets a 30-day session cookie on success.

    Args:
        request: GoogleAuthRequest containing the ID token from the Google Sign-In SDK.
        response: FastAPI Response used to set the session cookie.

    Returns:
        dict: `{"message": ..., "user": {id, username, email, displayName, profilePicture, authProvider}}`.

    Raises:
        HTTPException 501: If GOOGLE_CLIENT_ID is not configured.
        HTTPException 401: If the token verification fails.
    """
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
            elif user.get("auth_provider") != "google":
                await auth_service.update_google_link(user["id"], google_id)

            session_id = await auth_service.create_session(user["id"])
            set_session_cookie(response, session_id, max_age=30 * 24 * 60 * 60)
            await auth_service.update_last_login(user["id"])
            span.set_attribute("auth.user_id", user["id"])
            _auth_logins.add(1, {"auth.method": "google"})

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
    """Redirect the browser to Google's OAuth2 authorization page.

    Args:
        redirect_to: URL path to return to after successful authentication.

    Returns:
        RedirectResponse to the Google OAuth2 consent screen.

    Raises:
        HTTPException 501: If GOOGLE_CLIENT_ID is not configured.
    """
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
    """Handle the OAuth2 authorization code callback from Google.

    Exchanges the authorization code for tokens, fetches the Google user profile,
    creates or retrieves the local user account, and sets a 30-day session cookie.
    Redirects to `state` URL on both success and failure.

    Args:
        code: Authorization code returned by Google.
        error: Error string returned by Google if the user denied access.
        state: URL path to redirect to after authentication.

    Returns:
        RedirectResponse to `state` with `?login=success` or `?error=google_auth_failed`.
    """
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
                if user.get("auth_provider") != "google":
                    await auth_service.update_google_link(user["id"], google_user["id"])
                await auth_service.update_last_login(user["id"])

            session_id = await auth_service.create_session(user["id"])
            redirect_response = RedirectResponse(url=f"{state}?login=success&provider=google")
            set_session_cookie(redirect_response, session_id, max_age=30 * 24 * 60 * 60)
            return redirect_response

        except Exception:
            logger.exception("Google OAuth callback failed")
            return RedirectResponse(url=f"{state}?error=google_auth_failed")
