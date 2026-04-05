"""Shared authentication dependencies for FastAPI route handlers."""
import logging
from typing import Optional

from fastapi import Cookie, HTTPException

from auth_service import AuthService

logger = logging.getLogger(__name__)

_auth_service = AuthService()


async def require_user(sessionId: Optional[str] = Cookie(None)) -> dict:
    if not sessionId:
        raise HTTPException(status_code=401, detail="Authentication required")
    user = await _auth_service.get_user_by_session(sessionId)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


async def optional_user(sessionId: Optional[str] = Cookie(None)) -> Optional[dict]:
    if not sessionId:
        return None
    return await _auth_service.get_user_by_session(sessionId)
