import httpx
from fastapi import APIRouter, HTTPException, Response, Cookie, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
import os
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
import secrets

from auth_service import AuthService

router = APIRouter()
auth_service = AuthService()
csrf_tokens = {}

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

def set_session_cookie(response: Response, session_id: str, max_age: int = 7 * 24 * 60 * 60):
    """Helper to set session cookie with consistent parameters"""
    response.set_cookie(
        key="sessionId",
        value=session_id,
        httponly=True,
        secure=os.getenv('NODE_ENV') == 'production',
        samesite='lax',
        max_age=max_age,
        path='/'
    )

def delete_session_cookie(response: Response):
    """Helper to delete session cookie with matching parameters"""
    response.delete_cookie(
        key="sessionId",
        path='/',
        domain=None,
        secure=os.getenv('NODE_ENV') == 'production',
        httponly=True,
        samesite='lax'
    )
    response.set_cookie(
        key="sessionId",
        value="",
        max_age=0,
        path='/'
    )

@router.get("/csrf-token")
async def get_csrf_token(response: Response):
    token = secrets.token_urlsafe(32)
    csrf_tokens[token] = datetime.now()
    response.set_cookie(
        key="csrf_token",
        value=token,
        httponly=True,
        secure=os.getenv('NODE_ENV') == 'production',
        samesite='strict'
    )
    return {"csrfToken": token}

@router.get("/me")
async def get_current_user(
        response: Response,
        sessionId: Optional[str] = Cookie(None),
        x_session_id: Optional[str] = None
):
    session_id = sessionId or x_session_id

    if not session_id:
        raise HTTPException(status_code=401, detail="No session provided")

    user = await auth_service.get_user_by_session(session_id)

    if not user:
        delete_session_cookie(response)
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    await auth_service.update_last_login(user['id'])

    return {
        "id": user['id'],
        "username": user['username'],
        "email": user['email'],
        "displayName": user['display_name'],
        "profilePicture": user.get('profile_picture'),
        "authProvider": user['auth_provider'],
        "emailVerified": user.get('email_verified', False),
        "lastLogin": user.get('last_login'),
    }

@router.get("/stats")
async def get_user_stats():
    return {
        "gamesPlayed": 4,
        "winRate": 34,
        "aiContributions": 944,
    }

@router.post("/register")
async def register(request: RegisterRequest, response: Response):
    # Validate password length
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")

    # Validate username length
    if len(request.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters long")

    # Check if email already exists
    existing_user = await auth_service.find_user_by_email(request.email)
    if existing_user:
        raise HTTPException(status_code=409, detail="Email already registered")

    # Check if username already exists
    existing_username = await auth_service.find_user_by_username(request.username)
    if existing_username:
        raise HTTPException(status_code=409, detail="Username already taken")

    try:
        user = await auth_service.create_user(
            username=request.username,
            email=request.email,
            password=request.password,
            display_name=request.displayName or request.username
        )

        session_id = await auth_service.create_session(user['id'])
        set_session_cookie(response, session_id, max_age=7 * 24 * 60 * 60)

        return {
            "message": "User registered successfully",
            "user": {
                "id": user['id'],
                "username": user['username'],
                "email": user['email'],
                "displayName": user['display_name'],
                "authProvider": user['auth_provider'],
            }
        }
    except Exception as e:
        print(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail="Registration failed. Please try again.")

@router.post("/login")
async def login(request: LoginRequest, response: Response):
    user = await auth_service.find_user_by_email(request.email)

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user['auth_provider'] == 'local' and user.get('password_hash'):
        if not await auth_service.verify_password(request.password, user['password_hash']):
            raise HTTPException(status_code=401, detail="Invalid email or password")
    else:
        raise HTTPException(status_code=401, detail="Please use Google Sign-In for this account")

    session_id = await auth_service.create_session(user['id'])
    max_age = 30 * 24 * 60 * 60 if request.rememberMe else 7 * 24 * 60 * 60
    set_session_cookie(response, session_id, max_age=max_age)

    await auth_service.update_last_login(user['id'])

    return {
        "message": "Login successful",
        "user": {
            "id": user['id'],
            "username": user['username'],
            "email": user['email'],
            "displayName": user['display_name'],
            "profilePicture": user.get('profile_picture'),
            "authProvider": user['auth_provider'],
        }
    }

@router.post("/logout")
async def logout(
        response: Response,
        request: LogoutRequest = None,
        sessionId: Optional[str] = Cookie(None),
        x_session_id: Optional[str] = None
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
        "google_oauth": "Configured" if os.getenv('GOOGLE_CLIENT_ID') else "Not configured",
        "timestamp": datetime.now().isoformat(),
    }

class GoogleAuthRequest(BaseModel):
    token: str

@router.post("/google")
async def google_auth(request: GoogleAuthRequest, response: Response):
    try:
        client_id = os.getenv('GOOGLE_CLIENT_ID')
        if not client_id:
            raise HTTPException(status_code=501, detail="Google OAuth not configured")

        idinfo = id_token.verify_oauth2_token(
            request.token,
            google_requests.Request(),
            client_id
        )

        email = idinfo['email']
        name = idinfo.get('name', '')
        picture = idinfo.get('picture', '')
        google_id = idinfo['sub']

        user = await auth_service.find_user_by_email(email)

        if not user:
            user = await auth_service.create_google_user(
                email=email,
                google_id=google_id,
                display_name=name,
                profile_picture=picture
            )

        session_id = await auth_service.create_session(user['id'])
        set_session_cookie(response, session_id, max_age=30 * 24 * 60 * 60)

        await auth_service.update_last_login(user['id'])

        return {
            "message": "Login successful",
            "user": {
                "id": user['id'],
                "username": user['username'],
                "email": user['email'],
                "displayName": user['display_name'],
                "profilePicture": user.get('profile_picture'),
                "authProvider": "google",
            }
        }
    except Exception as e:
        print(f"Google auth error: {e}")
        raise HTTPException(status_code=401, detail="Google authentication failed")

@router.get("/google")
async def google_login(request: Request, redirect_to: str = "/"):
    """Initiate Google OAuth flow"""
    client_id = os.getenv('GOOGLE_CLIENT_ID')
    if not client_id:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    # Store redirect path in session or encode in state parameter
    state = f"{redirect_to}"
    redirect_uri = "http://localhost:8000/api/auth/google/callback"

    google_auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={client_id}&"
        f"redirect_uri={redirect_uri}&"
        "scope=email profile&"
        "response_type=code&"
        "access_type=offline&"
        "prompt=select_account&"
        f"state={state}"
    )

    return RedirectResponse(url=google_auth_url)


@router.get("/google/callback")
async def google_callback(code: str = None, error: str = None, state: str = "/"):
    """Handle Google OAuth callback"""
    try:
        if error:
            return RedirectResponse(url=f"{state}?error=google_auth_failed")

        if not code:
            return RedirectResponse(url=f"{state}?error=google_auth_failed")

        token_url = "https://oauth2.googleapis.com/token"
        token_data = {
            "client_id": os.getenv('GOOGLE_CLIENT_ID'),
            "client_secret": os.getenv('GOOGLE_CLIENT_SECRET'),
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": "http://localhost:8000/api/auth/google/callback",
        }

        async with httpx.AsyncClient() as client:
            token_response = await client.post(token_url, data=token_data)
            tokens = token_response.json()

        if not tokens.get('access_token'):
            return RedirectResponse(url=f"{state}?error=google_auth_failed")

        userinfo_url = "https://www.googleapis.com/oauth2/v2/userinfo"
        async with httpx.AsyncClient() as client:
            user_response = await client.get(
                userinfo_url,
                headers={"Authorization": f"Bearer {tokens['access_token']}"}
            )
            google_user = user_response.json()

        user = await auth_service.find_user_by_email(google_user['email'])

        if not user:
            user = await auth_service.create_google_user(
                email=google_user['email'],
                google_id=google_user['id'],
                display_name=google_user.get('name', ''),
                profile_picture=google_user.get('picture', '')
            )
        else:
            await auth_service.update_last_login(user['id'])

        session_id = await auth_service.create_session(user['id'])

        redirect_response = RedirectResponse(url=f"{state}?login=success&provider=google")
        set_session_cookie(redirect_response, session_id, max_age=30 * 24 * 60 * 60)

        return redirect_response

    except Exception as e:
        print(f"Google OAuth callback error: {e}")
        return RedirectResponse(url=f"{state}?error=google_auth_failed")