"""Integration tests for auth session management."""
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_auth_create_user_persists(seeded_db):
    result = await seeded_db.execute(
        text("SELECT id, email, username FROM users WHERE email = 'test@example.com'")
    )
    row = result.fetchone()
    assert row is not None
    assert row.username == "test"
    assert row.email == "test@example.com"


@pytest.mark.asyncio
async def test_auth_session_created_and_retrievable(seeded_db):
    result = await seeded_db.execute(
        text("SELECT id FROM users WHERE email = 'test@example.com'")
    )
    user = result.fetchone()
    session_id = str(uuid4())
    expires_at = datetime.now() + timedelta(days=7)
    await seeded_db.execute(
        text(
            "INSERT INTO user_sessions (session_id, user_id, expires_at)"
            " VALUES (:sid, :uid, :exp)"
        ),
        {"sid": session_id, "uid": user.id, "exp": expires_at},
    )
    await seeded_db.commit()
    result = await seeded_db.execute(
        text(
            "SELECT u.id, u.email FROM users u"
            " JOIN user_sessions s ON s.user_id = u.id"
            " WHERE s.session_id = :sid AND s.expires_at > NOW()"
        ),
        {"sid": session_id},
    )
    row = result.fetchone()
    assert row is not None
    assert row.id == user.id
    await seeded_db.execute(
        text("DELETE FROM user_sessions WHERE session_id = :sid"),
        {"sid": session_id},
    )
    await seeded_db.commit()


@pytest.mark.asyncio
async def test_auth_delete_session_removes_access(seeded_db):
    result = await seeded_db.execute(
        text("SELECT id FROM users WHERE email = 'test@example.com'")
    )
    user = result.fetchone()
    session_id = str(uuid4())
    expires_at = datetime.now() + timedelta(days=7)
    await seeded_db.execute(
        text(
            "INSERT INTO user_sessions (session_id, user_id, expires_at)"
            " VALUES (:sid, :uid, :exp)"
        ),
        {"sid": session_id, "uid": user.id, "exp": expires_at},
    )
    await seeded_db.commit()
    await seeded_db.execute(
        text("DELETE FROM user_sessions WHERE session_id = :sid"),
        {"sid": session_id},
    )
    await seeded_db.commit()
    result = await seeded_db.execute(
        text(
            "SELECT 1 FROM user_sessions WHERE session_id = :sid AND expires_at > NOW()"
        ),
        {"sid": session_id},
    )
    assert result.fetchone() is None
