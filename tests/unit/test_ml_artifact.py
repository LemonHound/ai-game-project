import pytest
from ml.artifact import load_chess_model_artifact, validate_artifact


def test_validate_artifact_accepts_matching_counts():
    validate_artifact(2, {0: "e2e4", 1: "d2d4"}, {"class_count": 2})


def test_validate_artifact_rejects_mismatch():
    with pytest.raises(ValueError):
        validate_artifact(3, {0: "e2e4", 1: "d2d4"}, {"class_count": 2})


def test_load_missing_directory_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_chess_model_artifact(str(tmp_path / "does_not_exist"))


def test_load_missing_file_raises(tmp_path):
    (tmp_path / "vocab.json").write_text("{}", encoding="utf-8")
    with pytest.raises(FileNotFoundError):
        load_chess_model_artifact(str(tmp_path))
