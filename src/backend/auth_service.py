import bcrypt
from uuid import uuid4
from datetime import datetime, timedelta
from typing import Optional, Dict

from database import get_db_connection, return_db_connection


class AuthService:

    async def create_google_user(self, email: str, google_id: str, display_name: str, profile_picture: str) -> Dict:
        conn = get_db_connection()
        if not conn:
            raise RuntimeError("Database connection unavailable")
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO users (username, email, google_id, display_name, profile_picture,
                                   auth_provider, email_verified)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, username, email, display_name, auth_provider, created_at
                """,
                (email.split('@')[0], email, google_id, display_name, profile_picture, 'google', True)
            )
            row = cursor.fetchone()
            conn.commit()
            cursor.close()
            return {
                'id': row[0],
                'username': row[1],
                'email': row[2],
                'display_name': row[3],
                'auth_provider': row[4],
                'created_at': row[5],
                'profile_picture': profile_picture,
            }
        except Exception:
            raise
        finally:
            return_db_connection(conn)

    async def hash_password(self, password: str) -> str:
        salt = bcrypt.gensalt(12)
        password_hash = bcrypt.hashpw(password.encode('utf-8'), salt)
        return password_hash.decode('utf-8')

    async def verify_password(self, password: str, password_hash: str) -> bool:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))

    async def create_session(self, user_id: int) -> str:
        conn = get_db_connection()
        if not conn:
            raise RuntimeError("Database connection unavailable")
        session_id = str(uuid4())
        expires_at = datetime.now() + timedelta(days=7)
        try:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO user_sessions (session_id, user_id, expires_at) VALUES (%s, %s, %s)",
                (session_id, user_id, expires_at)
            )
            conn.commit()
            cursor.close()
        except Exception:
            raise
        finally:
            return_db_connection(conn)
        return session_id

    async def find_user_by_username(self, username: str) -> Optional[Dict]:
        conn = get_db_connection()
        if not conn:
            raise RuntimeError("Database connection unavailable")
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, username, email, display_name, profile_picture,
                       auth_provider, email_verified, password_hash, created_at, last_login
                FROM users
                WHERE username = %s
                """,
                (username,)
            )
            row = cursor.fetchone()
            cursor.close()
            if row:
                return {
                    'id': row[0],
                    'username': row[1],
                    'email': row[2],
                    'display_name': row[3],
                    'profile_picture': row[4],
                    'auth_provider': row[5],
                    'email_verified': row[6],
                    'password_hash': row[7],
                    'created_at': row[8],
                    'last_login': row[9],
                }
            return None
        except Exception:
            raise
        finally:
            return_db_connection(conn)

    async def get_user_by_session(self, session_id: str) -> Optional[Dict]:
        conn = get_db_connection()
        if not conn:
            raise RuntimeError("Database connection unavailable")
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT u.id, u.username, u.email, u.display_name, u.profile_picture,
                       u.auth_provider, u.email_verified, u.last_login, u.password_hash
                FROM users u
                         JOIN user_sessions s ON u.id = s.user_id
                WHERE s.session_id = %s AND s.expires_at > NOW()
                """,
                (session_id,)
            )
            row = cursor.fetchone()
            cursor.close()
            if row:
                return {
                    'id': row[0],
                    'username': row[1],
                    'email': row[2],
                    'display_name': row[3],
                    'profile_picture': row[4],
                    'auth_provider': row[5],
                    'email_verified': row[6],
                    'last_login': row[7],
                    'password_hash': row[8],
                }
            return None
        except Exception:
            raise
        finally:
            return_db_connection(conn)

    async def find_user_by_email(self, email: str) -> Optional[Dict]:
        conn = get_db_connection()
        if not conn:
            raise RuntimeError("Database connection unavailable")
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, username, email, display_name, profile_picture,
                       auth_provider, email_verified, password_hash, created_at, last_login
                FROM users WHERE email = %s
                """,
                (email,)
            )
            row = cursor.fetchone()
            cursor.close()
            if row:
                return {
                    'id': row[0],
                    'username': row[1],
                    'email': row[2],
                    'display_name': row[3],
                    'profile_picture': row[4],
                    'auth_provider': row[5],
                    'email_verified': row[6],
                    'password_hash': row[7],
                    'created_at': row[8],
                    'last_login': row[9],
                }
            return None
        except Exception:
            raise
        finally:
            return_db_connection(conn)

    async def create_user(self, username: str, email: str, password: str, display_name: str) -> Dict:
        password_hash = await self.hash_password(password)
        conn = get_db_connection()
        if not conn:
            raise RuntimeError("Database connection unavailable")
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO users (username, email, password_hash, display_name, auth_provider, email_verified)
                VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id, username, email, display_name, auth_provider, created_at
                """,
                (username, email, password_hash, display_name, 'local', False)
            )
            row = cursor.fetchone()
            conn.commit()
            cursor.close()
            return {
                'id': row[0],
                'username': row[1],
                'email': row[2],
                'display_name': row[3],
                'auth_provider': row[4],
                'created_at': row[5],
            }
        except Exception:
            raise
        finally:
            return_db_connection(conn)

    async def update_last_login(self, user_id: int):
        conn = get_db_connection()
        if not conn:
            raise RuntimeError("Database connection unavailable")
        try:
            cursor = conn.cursor()
            cursor.execute("UPDATE users SET last_login = NOW() WHERE id = %s", (user_id,))
            conn.commit()
            cursor.close()
        except Exception:
            raise
        finally:
            return_db_connection(conn)

    async def delete_session(self, session_id: str):
        conn = get_db_connection()
        if not conn:
            raise RuntimeError("Database connection unavailable")
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM user_sessions WHERE session_id = %s", (session_id,))
            conn.commit()
            cursor.close()
        except Exception:
            raise
        finally:
            return_db_connection(conn)

    async def check_database(self) -> str:
        conn = get_db_connection()
        if not conn:
            return "No connection pool"
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.close()
            return "Connected and working"
        except Exception as e:
            return f"Connected but error: {str(e)}"
        finally:
            return_db_connection(conn)
