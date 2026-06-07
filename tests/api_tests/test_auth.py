"""API tests for auth endpoints."""
import uuid


def test_auth_register_login_logout_flow(client):
    unique = uuid.uuid4().hex[:8]
    email = f"apitest_{unique}@example.com"
    reg = client.post(
        "/api/auth/register",
        json={"email": email, "password": "testpass123", "displayName": "API Test"},
    )
    assert reg.status_code == 201
    user = reg.json()["user"]
    assert user["email"] == email
    assert user["username"] == email
    assert user["displayName"] == "API Test"

    login_resp = client.post(
        "/api/auth/login",
        json={"email": email, "password": "testpass123"},
    )
    assert login_resp.status_code == 200
    assert login_resp.json()["user"]["email"] == email

    me_resp = client.get("/api/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["username"] == email

    logout_resp = client.post("/api/auth/logout")
    assert logout_resp.status_code == 200

    me_after = client.get("/api/auth/me")
    assert me_after.status_code == 401


def test_auth_register_accepts_email_longer_than_legacy_username_limit(client):
    unique = uuid.uuid4().hex[:8]
    local = ("x" * 40) + unique
    email = f"{local}@example.com"
    assert len(email) > 50

    reg = client.post(
        "/api/auth/register",
        json={"email": email, "password": "testpass123"},
    )
    assert reg.status_code == 201
    assert reg.json()["user"]["username"] == email


def test_auth_register_defaults_display_name_to_email_local_part(client):
    unique = uuid.uuid4().hex[:8]
    email = f"nodisplay_{unique}@example.com"
    reg = client.post(
        "/api/auth/register",
        json={"email": email, "password": "testpass123"},
    )
    assert reg.status_code == 201
    assert reg.json()["user"]["displayName"] == f"nodisplay_{unique}"


def test_auth_register_duplicate_email_conflicts(client):
    unique = uuid.uuid4().hex[:8]
    email = f"dupe_{unique}@example.com"
    first = client.post(
        "/api/auth/register",
        json={"email": email, "password": "testpass123"},
    )
    assert first.status_code == 201
    second = client.post(
        "/api/auth/register",
        json={"email": email, "password": "testpass123"},
    )
    assert second.status_code == 409


def test_auth_me_unauthenticated(client):
    client.cookies.clear()
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_google_logo_served_when_available(client, monkeypatch):
    import google_logo

    async def fake_get_logo():
        return b"PNGDATA"

    monkeypatch.setattr(google_logo, "get_logo", fake_get_logo)
    resp = client.get("/api/auth/google-logo")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    assert resp.content == b"PNGDATA"


def test_google_logo_404_when_unavailable(client, monkeypatch):
    import google_logo

    async def fake_get_logo():
        return None

    monkeypatch.setattr(google_logo, "get_logo", fake_get_logo)
    resp = client.get("/api/auth/google-logo")
    assert resp.status_code == 404
