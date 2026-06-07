import model_registry


def test_parse_semver_orders_numerically():
    assert model_registry.parse_semver("2.10.0") > model_registry.parse_semver("2.9.1")


def test_group_and_sort_engines_groups_by_difficulty_and_sorts_desc():
    rows = [
        {"id": 1, "difficulty": "untrained", "version": "0.1.0", "class_count": 10, "created_at": None},
        {"id": 2, "difficulty": "untrained", "version": "0.2.0", "class_count": 11, "created_at": None},
        {"id": 3, "difficulty": "cnn", "version": "1.0.0", "class_count": 12, "created_at": None},
    ]
    grouped = model_registry.group_and_sort_engines(rows)
    assert [g["difficulty"] for g in grouped] == ["cnn", "untrained"]
    untrained = next(g for g in grouped if g["difficulty"] == "untrained")
    assert [v["version"] for v in untrained["versions"]] == ["0.2.0", "0.1.0"]
