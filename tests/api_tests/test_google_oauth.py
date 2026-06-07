"""API tests for Google OAuth error-path handling."""


def test_oauth_callback_redirects_to_root_on_error(client):
    response = client.get(
        "/api/auth/google/callback",
        params={"error": "access_denied"},
        follow_redirects=False,
    )
    assert response.status_code in (302, 307)
    location = response.headers["location"]
    assert "error=google_auth_failed" in location


def test_oauth_callback_redirects_on_missing_code(client):
    response = client.get(
        "/api/auth/google/callback",
        follow_redirects=False,
    )
    assert response.status_code in (302, 307)
    location = response.headers["location"]
    assert "error=google_auth_failed" in location


def test_oauth_login_route_redirects_to_google(monkeypatch, client):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id")
    response = client.get(
        "/api/auth/google",
        follow_redirects=False,
    )
    assert response.status_code in (302, 307)
    location = response.headers["location"]
    assert "accounts.google.com" in location


def test_google_user_stores_email_as_username(monkeypatch, client):
    import uuid

    import auth as auth_module

    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id")
    email = f"goog_{uuid.uuid4().hex[:8]}@example.com"

    def fake_verify(token, request, client_id):
        return {"email": email, "sub": f"sub-{email}", "name": "Goog User", "picture": ""}

    monkeypatch.setattr(auth_module.id_token, "verify_oauth2_token", fake_verify)
    resp = client.post("/api/auth/google", json={"token": "fake-token"})
    assert resp.status_code == 200
    user = resp.json()["user"]
    assert user["email"] == email
    assert user["username"] == email
