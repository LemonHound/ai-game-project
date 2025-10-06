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
        response.delete_cookie("sessionId")
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
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")

    existing_user = await auth_service.find_user_by_email(request.email)
    if existing_user:
        raise HTTPException(status_code=409, detail="Email already exists")

    user = await auth_service.create_user(
        username=request.username,
        email=request.email,
        password=request.password,
        display_name=request.displayName or request.username
    )

    session_id = await auth_service.create_session(user['id'])

    response.set_cookie(
        key="sessionId",
        value=session_id,
        httponly=True,
        secure=os.getenv('NODE_ENV') == 'production',
        samesite='strict',
        max_age=7 * 24 * 60 * 60
    )

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

@router.post("/login")
async def login(request: LoginRequest, response: Response):
    user = await auth_service.find_user_by_email(request.email)

    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user['auth_provider'] == 'local' and user.get('password_hash'):
        if not await auth_service.verify_password(request.password, user['password_hash']):
            raise HTTPException(status_code=401, detail="Invalid credentials")

    session_id = await auth_service.create_session(user['id'])

    max_age = 30 * 24 * 60 * 60 if request.rememberMe else 7 * 24 * 60 * 60

    response.set_cookie(
        key="sessionId",
        value=session_id,
        httponly=True,
        secure=os.getenv('NODE_ENV') == 'production',
        samesite='strict',
        max_age=max_age
    )

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
        request: LogoutRequest,
        sessionId: Optional[str] = Cookie(None),
        x_session_id: Optional[str] = None
):
    session_id = sessionId or x_session_id or request.sessionId

    if session_id:
        await auth_service.delete_session(session_id)

    response.delete_cookie("sessionId")

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

        # Verify the token with Google
        idinfo = id_token.verify_oauth2_token(
            request.token,
            google_requests.Request(),
            client_id
        )

        email = idinfo['email']
        name = idinfo.get('name', '')
        picture = idinfo.get('picture', '')
        google_id = idinfo['sub']

        # Find or create user
        user = await auth_service.find_user_by_email(email)

        if not user:
            # Create new user from Google account
            user = await auth_service.create_google_user(
                email=email,
                google_id=google_id,
                display_name=name,
                profile_picture=picture
            )

        # Create session
        session_id = await auth_service.create_session(user['id'])

        response.set_cookie(
            key="sessionId",
            value=session_id,
            httponly=True,
            secure=os.getenv('NODE_ENV') == 'production',
            samesite='strict',
            max_age=30 * 24 * 60 * 60
        )

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
async def google_login(request: Request):
    """Initiate Google OAuth flow"""
    client_id = os.getenv('GOOGLE_CLIENT_ID')
    if not client_id:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    # Build Google OAuth URL
    redirect_uri = f"{os.getenv('PYTHON_BACKEND_URL', 'http://localhost:8000')}/api/auth/google/callback"

    google_auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={client_id}&"
        f"redirect_uri={redirect_uri}&"
        "scope=email profile&"
        "response_type=code&"
        "access_type=offline&"
        "prompt=select_account"
    )

    print(f"Redirecting to Google OAuth: {google_auth_url}")
    return RedirectResponse(url=google_auth_url)

@router.get("/google/callback")
async def google_callback(code: str = None, error: str = None, response: Response = None):
    """Handle Google OAuth callback"""
    try:
        if error:
            print(f"Google OAuth error: {error}")
            return RedirectResponse(url=f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/?error=google_auth_failed")

        if not code:
            print("No authorization code received")
            return RedirectResponse(url=f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/?error=google_auth_failed")

        print("Received Google auth code, exchanging for tokens...")

        # Exchange code for tokens
        token_url = "https://oauth2.googleapis.com/token"
        token_data = {
            "client_id": os.getenv('GOOGLE_CLIENT_ID'),
            "client_secret": os.getenv('GOOGLE_CLIENT_SECRET'),
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": f"{os.getenv('PYTHON_BACKEND_URL', 'http://localhost:8000')}/api/auth/google/callback",
        }

        async with httpx.AsyncClient() as client:
            token_response = await client.post(token_url, data=token_data)
            tokens = token_response.json()

        print("Token exchange result:", "SUCCESS" if tokens.get('access_token') else "FAILED")

        if not tokens.get('access_token'):
            print(f"Failed to get access token: {tokens}")
            return RedirectResponse(url=f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/?error=google_auth_failed")

        # Get user info from Google
        userinfo_url = "https://www.googleapis.com/oauth2/v2/userinfo"
        async with httpx.AsyncClient() as client:
            user_response = await client.get(
                userinfo_url,
                headers={"Authorization": f"Bearer {tokens['access_token']}"}
            )
            google_user = user_response.json()

        print(f"Google user info received: {google_user.get('email')}")

        # Find or create user
        user = await auth_service.find_user_by_email(google_user['email'])

        if not user:
            print("Creating new user from Google account...")
            user = await auth_service.create_google_user(
                email=google_user['email'],
                google_id=google_user['id'],
                display_name=google_user.get('name', ''),
                profile_picture=google_user.get('picture', '')
            )
        else:
            print("Existing user found, updating last login...")
            await auth_service.update_last_login(user['id'])

        # Create session
        session_id = await auth_service.create_session(user['id'])

        # Build redirect response to frontend
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
        redirect_response = RedirectResponse(url=f"{frontend_url}/?login=success&provider=google")

        # Set session cookie
        redirect_response.set_cookie(
            key="sessionId",
            value=session_id,
            httponly=True,
            secure=os.getenv('NODE_ENV') == 'production',
            samesite='lax',  # Changed from 'strict' to 'lax' for cross-site redirects
            max_age=30 * 24 * 60 * 60,
            domain='localhost',  # Explicit domain for localhost
        )

        print("Session cookie set, redirecting to frontend")
        return redirect_response

    except Exception as e:
        print(f"Google OAuth callback error: {e}")
        return RedirectResponse(url=f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/?error=google_auth_failed")