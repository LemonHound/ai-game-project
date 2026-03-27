import logging
from datetime import datetime, timedelta
from typing import Optional, Dict
from uuid import uuid4

import bcrypt
from sqlalchemy import text

from db import get_session

logger = logging.getLogger(__name__)


class AuthService:

    async def create_google_user(
        self, email: str, google_id: str, display_name: str, profile_picture: str
    ) -> Dict:
        async with get_session() as session:
            result = await session.execute(
                text("""
                    INSERT INTO users
                        (username, email, google_id, display_name, profile_picture,
                         auth_provider, email_verified)
                    VALUES
                        (:username, :email, :google_id, :display_name, :profile_picture,
                         'google', true)
                    RETURNING id, username, email, display_name, auth_provider, created_at
                """),
                {
                    "username": email.split("@")[0],
                    "email": email,
                    "google_id": google_id,
                    "display_name": display_name,
                    "profile_picture": profile_picture,
                },
            )
            row = result.fetchone()
            await session.commit()
            return {
                "id": row.id,
                "username": row.username,
                "email": row.email,
                "display_name": row.display_name,
                "auth_provider": row.auth_provider,
                "created_at": row.created_at,
                "profile_picture": profile_picture,
            }

    async def hash_password(self, password: str) -> str:
        salt = bcrypt.gensalt(12)
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    async def verify_password(self, password: str, password_hash: str) -> bool:
        return bcrypt.checkpw(
            password.encode("utf-8"), password_hash.encode("utf-8")
        )

    async def create_session(self, user_id: int) -> str:
        session_id = str(uuid4())
        expires_at = datetime.now() + timedelta(days=7)
        async with get_session() as session:
            await session.execute(
                text(
                    "INSERT INTO user_sessions (session_id, user_id, expires_at)"
                    " VALUES (:session_id, :user_id, :expires_at)"
                ),
                {
                    "session_id": session_id,
                    "user_id": user_id,
                    "expires_at": expires_at,
                },
            )
            await session.commit()
        return session_id

    async def find_user_by_username(self, username: str) -> Optional[Dict]:
        async with get_session() as session:
            result = await session.execute(
                text("""
                    SELECT id, username, email, display_name, profile_picture,
                           auth_provider, email_verified, password_hash,
                           created_at, last_login
                    FROM users WHERE username = :username
                """),
                {"username": username},
            )
            row = result.fetchone()
            if row:
                return dict(row._mapping)
            return None

    async def get_user_by_session(self, session_id: str) -> Optional[Dict]:
        async with get_session() as session:
            result = await session.execute(
                text("""
                    SELECT u.id, u.username, u.email, u.display_name,
                           u.profile_picture, u.auth_provider, u.email_verified,
                           u.last_login, u.password_hash
                    FROM users u
                    JOIN user_sessions s ON u.id = s.user_id
                    WHERE s.session_id = :session_id AND s.expires_at > NOW()
                """),
                {"session_id": session_id},
            )
            row = result.fetchone()
            if row:
                return dict(row._mapping)
            return None

    async def find_user_by_email(self, email: str) -> Optional[Dict]:
        async with get_session() as session:
            result = await session.execute(
                text("""
                    SELECT id, username, email, display_name, profile_picture,
                           auth_provider, email_verified, password_hash,
                           created_at, last_login
                    FROM users WHERE email = :email
                """),
                {"email": email},
            )
            row = result.fetchone()
            if row:
                return dict(row._mapping)
            return None

    async def create_user(
        self, username: str, email: str, password: str, display_name: str
    ) -> Dict:
        password_hash = await self.hash_password(password)
        async with get_session() as session:
            result = await session.execute(
                text("""
                    INSERT INTO users
                        (username, email, password_hash, display_name,
                         auth_provider, email_verified)
                    VALUES
                        (:username, :email, :password_hash, :display_name,
                         'local', false)
                    RETURNING id, username, email, display_name, auth_provider, created_at
                """),
                {
                    "username": username,
                    "email": email,
                    "password_hash": password_hash,
                    "display_name": display_name,
                },
            )
            row = result.fetchone()
            await session.commit()
            return {
                "id": row.id,
                "username": row.username,
                "email": row.email,
                "display_name": row.display_name,
                "auth_provider": row.auth_provider,
                "created_at": row.created_at,
            }

    async def update_last_login(self, user_id: int) -> None:
        async with get_session() as session:
            await session.execute(
                text("UPDATE users SET last_login = NOW() WHERE id = :user_id"),
                {"user_id": user_id},
            )
            await session.commit()

    async def delete_session(self, session_id: str) -> None:
        async with get_session() as session:
            await session.execute(
                text("DELETE FROM user_sessions WHERE session_id = :session_id"),
                {"session_id": session_id},
            )
            await session.commit()

    async def check_database(self) -> str:
        try:
            async with get_session() as session:
                await session.execute(text("SELECT 1"))
            return "Connected and working"
        except Exception as exc:
            return f"Error: {exc}"
