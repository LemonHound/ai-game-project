"""API tests for PATCH /api/auth/settings and DELETE /api/auth/account."""
import uuid

import pytest


def _register_fresh_user(client):
    unique = uuid.uuid4().hex[:8]
    email = f"settings_{unique}@example.com"
    password = "testpass123"
    resp = client.post(
        "/api/auth/register",
        json={
            "username": f"settings_{unique}",
            "email": email,
            "password": password,
            "displayName": f"TestUser_{unique}",
        },
    )
    assert resp.status_code == 201
    return email, password


def test_settings_update_display_name(client):
    _register_fresh_user(client)
    resp = client.patch(
        "/api/auth/settings",
        json={"display_name": "UpdatedName"},
    )
    assert resp.status_code == 200
    assert resp.json()["displayName"] == "UpdatedName"


def test_settings_change_password_success(client):
    _, _ = _register_fresh_user(client)
    resp = client.patch(
        "/api/auth/settings",
        json={"current_password": "testpass123", "new_password": "newpass456"},
    )
    assert resp.status_code == 200


def test_settings_change_password_wrong_current(client):
    _register_fresh_user(client)
    resp = client.patch(
        "/api/auth/settings",
        json={"current_password": "wrongpassword", "new_password": "newpass456"},
    )
    assert resp.status_code == 401


def test_settings_update_stats_public(auth_client):
    resp = auth_client.patch(
        "/api/auth/settings",
        json={"statsPublic": True},
    )
    assert resp.status_code == 200
    assert resp.json()["statsPublic"] is True


def test_account_deletion_soft_deletes(client):
    email, password = _register_fresh_user(client)
    delete_resp = client.delete("/api/auth/account")
    assert delete_resp.status_code == 200
    assert delete_resp.json()["message"] == "Account deactivated."

    me_resp = client.get("/api/auth/me")
    assert me_resp.status_code == 401
