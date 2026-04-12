"""API tests for Google OAuth error-path handling."""
import os


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
