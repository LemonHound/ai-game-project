"""API tests for auth endpoints."""
import uuid


def test_auth_register_login_logout_flow(client):
    unique = uuid.uuid4().hex[:8]
    reg = client.post(
        "/api/auth/register",
        json={
            "username": f"apitest_{unique}",
            "email": f"apitest_{unique}@example.com",
            "password": "testpass123",
        },
    )
    assert reg.status_code == 201
    assert "user" in reg.json()

    login_resp = client.post(
        "/api/auth/login",
        json={"email": f"apitest_{unique}@example.com", "password": "testpass123"},
    )
    assert login_resp.status_code == 200
    assert login_resp.json()["user"]["email"] == f"apitest_{unique}@example.com"

    me_resp = client.get("/api/auth/me")
    assert me_resp.status_code == 200

    logout_resp = client.post("/api/auth/logout")
    assert logout_resp.status_code == 200

    me_after = client.get("/api/auth/me")
    assert me_after.status_code == 401


def test_auth_me_unauthenticated(client):
    client.cookies.clear()
    response = client.get("/api/auth/me")
    assert response.status_code == 401
