"""
Seed test users for CI smoke tests.
Run after `alembic upgrade head` with DB env vars set.
Idempotent: uses ON CONFLICT DO UPDATE.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../src/backend"))

from sqlalchemy import text
from db import get_session, init_db, close_db

_TEST_USERS = [
    {
        "username": "demo",
        "email": "demo@aigamehub.com",
        "password_hash": "$2b$12$KrfU4z6FgEFr8dK8qK/RSOKMS560sO1Pd2OtSWBGamypeMaYsJj3W",
        "display_name": "Demo Player",
    },
    {
        "username": "test",
        "email": "test@example.com",
        "password_hash": "$2b$12$KrfU4z6FgEFr8dK8qK/RSOKMS560sO1Pd2OtSWBGamypeMaYsJj3W",
        "display_name": "Test User",
    },
    {
        "username": "player1",
        "email": "player1@example.com",
        "password_hash": "$2b$12$KrfU4z6FgEFr8dK8qK/RSOKMS560sO1Pd2OtSWBGamypeMaYsJj3W",
        "display_name": "Player One",
    },
]


async def seed():
    await init_db()
    async with get_session() as session:
        for user in _TEST_USERS:
            await session.execute(
                text("""
                    INSERT INTO users
                        (username, email, password_hash, display_name,
                         auth_provider, email_verified)
                    VALUES
                        (:username, :email, :password_hash, :display_name,
                         'local', true)
                    ON CONFLICT (email) DO UPDATE SET
                        password_hash = EXCLUDED.password_hash,
                        display_name  = EXCLUDED.display_name,
                        email_verified = EXCLUDED.email_verified,
                        auth_provider  = EXCLUDED.auth_provider
                """),
                user,
            )
        await session.commit()
    await close_db()
    print(f"Seeded {len(_TEST_USERS)} test users.")


if __name__ == "__main__":
    asyncio.run(seed())
