"""Service layer for user registration, login, session management, and Google OAuth."""
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict
from uuid import uuid4

import bcrypt
from sqlalchemy import text

from db import get_session

logger = logging.getLogger(__name__)


class AuthService:
    """Database-backed service for user authentication and session management."""

    async def create_google_user(
        self, email: str, google_id: str, display_name: str, profile_picture: str
    ) -> Dict:
        """Create a new user record from a verified Google OAuth identity.

        Derives the username from the email local part. Sets auth_provider='google'
        and email_verified=True. Raises IntegrityError if the email already exists.

        Args:
            email: Verified email address from Google's ID token.
            google_id: Google account subject identifier (sub field).
            display_name: Full name from Google profile.
            profile_picture: Profile picture URL from Google profile.

        Returns:
            dict with keys: id, username, email, display_name, auth_provider,
            created_at, profile_picture.
        """
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
        """Hash a plaintext password with bcrypt (cost factor 12).

        Args:
            password: Plaintext password string.

        Returns:
            bcrypt hash string suitable for storage.
        """
        salt = bcrypt.gensalt(12)
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    async def verify_password(self, password: str, password_hash: str) -> bool:
        """Verify a plaintext password against a stored bcrypt hash.

        Args:
            password: Plaintext password string to verify.
            password_hash: bcrypt hash string from the database.

        Returns:
            True if the password matches, False otherwise.
        """
        return bcrypt.checkpw(
            password.encode("utf-8"), password_hash.encode("utf-8")
        )

    async def create_session(self, user_id: int) -> str:
        """Create a new user session valid for 7 days.

        Args:
            user_id: ID of the authenticated user.

        Returns:
            UUID session_id string to be stored in the session cookie.
        """
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
        """Look up a user by their username.

        Args:
            username: The user's username string.

        Returns:
            User row as a dict, or None if not found.
        """
        async with get_session() as session:
            result = await session.execute(
                text("""
                    SELECT id, username, email, display_name, profile_picture,
                           auth_provider, email_verified, password_hash,
                           created_at, last_login, is_active
                    FROM users WHERE username = :username
                """),
                {"username": username},
            )
            row = result.fetchone()
            if row:
                return dict(row._mapping)
            return None

    async def get_user_by_session(self, session_id: str) -> Optional[Dict]:
        """Look up the user associated with a valid, unexpired session cookie.

        Args:
            session_id: The session cookie value.

        Returns:
            User row as a dict, or None if the session is missing or expired.
        """
        async with get_session() as session:
            result = await session.execute(
                text("""
                    SELECT u.id, u.username, u.email, u.display_name,
                           u.profile_picture, u.auth_provider, u.email_verified,
                           u.last_login, u.password_hash, u.stats_public, u.is_active
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
        """Look up a user by their email address.

        Args:
            email: The user's email address.

        Returns:
            User row as a dict, or None if not found.
        """
        async with get_session() as session:
            result = await session.execute(
                text("""
                    SELECT id, username, email, display_name, profile_picture,
                           auth_provider, email_verified, password_hash,
                           created_at, last_login, is_active
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
        """Create a new local user account with a hashed password.

        Sets auth_provider='local' and email_verified=False. Raises IntegrityError
        if the username or email is already taken.

        Args:
            username: Unique username.
            email: Unique email address.
            password: Plaintext password (will be hashed before storage).
            display_name: Human-readable display name.

        Returns:
            dict with keys: id, username, email, display_name, auth_provider, created_at.
        """
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
        """Update the last_login timestamp for a user to the current time.

        Args:
            user_id: ID of the user to update.
        """
        async with get_session() as session:
            await session.execute(
                text("UPDATE users SET last_login = NOW() WHERE id = :user_id"),
                {"user_id": user_id},
            )
            await session.commit()

    async def delete_session(self, session_id: str) -> None:
        """Delete a user session from the database (logout).

        Args:
            session_id: The session cookie value to delete.
        """
        async with get_session() as session:
            await session.execute(
                text("DELETE FROM user_sessions WHERE session_id = :session_id"),
                {"session_id": session_id},
            )
            await session.commit()

    async def delete_sessions_by_user_id(self, user_id: int) -> None:
        """Delete all sessions for a user (used when deactivating an account).

        Args:
            user_id: ID of the user whose sessions should be deleted.
        """
        async with get_session() as session:
            await session.execute(
                text("DELETE FROM user_sessions WHERE user_id = :user_id"),
                {"user_id": user_id},
            )
            await session.commit()

    async def check_database(self) -> str:
        """Test database connectivity with a lightweight query.

        Returns:
            "Connected and working" on success, or an error description string on failure.
        """
        try:
            async with get_session() as session:
                await session.execute(text("SELECT 1"))
            return "Connected and working"
        except Exception as exc:
            return f"Error: {exc}"
