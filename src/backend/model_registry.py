import logging
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def parse_semver(version: str) -> tuple[int, int, int]:
    parts = version.split(".")
    if len(parts) != 3:
        raise ValueError(f"Invalid semver: {version!r}")
    return (int(parts[0]), int(parts[1]), int(parts[2]))


def group_and_sort_engines(rows: list[dict]) -> list[dict]:
    by_difficulty: dict[str, list[dict]] = {}
    for row in rows:
        by_difficulty.setdefault(row["difficulty"], []).append(row)
    grouped = []
    for difficulty in sorted(by_difficulty):
        versions = sorted(
            by_difficulty[difficulty],
            key=lambda r: parse_semver(r["version"]),
            reverse=True,
        )
        grouped.append(
            {
                "difficulty": difficulty,
                "versions": [
                    {
                        "id": v["id"],
                        "version": v["version"],
                        "class_count": v["class_count"],
                        "created_at": v["created_at"].isoformat() if v["created_at"] else None,
                    }
                    for v in versions
                ],
            }
        )
    return grouped


async def list_active_engines(session: AsyncSession, game: str) -> list[dict]:
    result = await session.execute(
        text(
            "SELECT id, difficulty, version, gcs_path, class_count, created_at "
            "FROM model_versions WHERE active AND game = :game"
        ),
        {"game": game},
    )
    return [dict(row) for row in result.mappings().all()]


async def get_engine(session: AsyncSession, engine_id: int) -> Optional[dict]:
    result = await session.execute(
        text(
            "SELECT id, game, difficulty, version, gcs_path, class_count, active "
            "FROM model_versions WHERE id = :id"
        ),
        {"id": engine_id},
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def latest_active_engine_id(session: AsyncSession, game: str) -> Optional[int]:
    rows = await list_active_engines(session, game)
    if not rows:
        return None
    rows.sort(key=lambda r: (parse_semver(r["version"]), r["created_at"]), reverse=True)
    return rows[0]["id"]


async def register_engine(
    session: AsyncSession,
    *,
    game: str,
    difficulty: str,
    version: str,
    gcs_path: str,
    class_count: Optional[int],
    source_commit: Optional[str],
) -> int:
    result = await session.execute(
        text(
            "INSERT INTO model_versions "
            "(game, difficulty, version, gcs_path, active, class_count, source_commit) "
            "VALUES (:game, :difficulty, :version, :gcs_path, true, :class_count, :source_commit) "
            "ON CONFLICT (game, difficulty, version) DO UPDATE SET "
            "gcs_path = EXCLUDED.gcs_path, active = true, "
            "class_count = EXCLUDED.class_count, source_commit = EXCLUDED.source_commit "
            "RETURNING id"
        ),
        {
            "game": game,
            "difficulty": difficulty,
            "version": version,
            "gcs_path": gcs_path,
            "class_count": class_count,
            "source_commit": source_commit,
        },
    )
    engine_id = result.scalar_one()
    await session.commit()
    return engine_id
