import os


def test_register_requires_key(client):
    response = client.post(
        "/api/internal/engines",
        json={
            "game": "chess",
            "difficulty": "untrained",
            "version": "9.9.9",
            "gcs_path": "chess/untrained/9.9.9",
            "class_count": 10,
            "source_commit": "abc",
        },
    )
    assert response.status_code == 403


def test_register_then_discoverable(client):
    key = os.environ["INTERNAL_API_KEY"]
    response = client.post(
        "/api/internal/engines",
        headers={"X-Internal-Key": key},
        json={
            "game": "chess",
            "difficulty": "cnn",
            "version": "1.2.0",
            "gcs_path": "chess/cnn/1.2.0",
            "class_count": 42,
            "source_commit": "deadbeef",
        },
    )
    assert response.status_code == 200
    engine_id = response.json()["id"]
    assert isinstance(engine_id, int)

    listing = client.get("/api/game/chess/engines")
    assert listing.status_code == 200
    groups = listing.json()["engines"]
    cnn = next(g for g in groups if g["difficulty"] == "cnn")
    assert any(v["id"] == engine_id and v["version"] == "1.2.0" for v in cnn["versions"])


def test_newgame_defaults_to_latest_engine_and_resume_reports_it(auth_client):
    new = auth_client.post("/api/game/chess/newgame", json={"player_starts": True})
    assert new.status_code == 200

    resumed = auth_client.get("/api/game/chess/resume")
    assert resumed.status_code == 200
    engine = resumed.json()["engine"]
    assert engine is not None
    assert engine["difficulty"]
    assert engine["version"]


def test_newgame_rejects_unknown_engine(auth_client):
    response = auth_client.post(
        "/api/game/chess/newgame",
        json={"player_starts": True, "engine_version_id": 999999},
    )
    assert response.status_code == 422
