import logging
import os
from datetime import datetime, timezone
from typing import Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

DEFAULT_LOGO_URL = "https://developers.google.com/identity/images/g-logo.png"
MAX_AGE_SECONDS = 24 * 60 * 60

_memory_cache: dict = {"data": None, "fetched_at": None}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _source_url() -> str:
    return os.getenv("GOOGLE_LOGO_URL", DEFAULT_LOGO_URL)


def _bucket_name() -> Optional[str]:
    return os.getenv("GOOGLE_LOGO_BUCKET") or None


def _object_name() -> str:
    return os.getenv("GOOGLE_LOGO_OBJECT", "google-logo.png")


def _age_seconds(fetched_at: Optional[datetime]) -> Optional[float]:
    if fetched_at is None:
        return None
    return (_now() - fetched_at).total_seconds()


def _bucket():
    name = _bucket_name()
    if not name:
        return None
    try:
        from google.cloud import storage

        return storage.Client().bucket(name)
    except Exception:
        logger.exception("Google logo: GCS client unavailable")
        return None


def _read_bucket() -> Tuple[Optional[bytes], Optional[datetime]]:
    bucket = _bucket()
    if bucket is None:
        return None, None
    try:
        blob = bucket.blob(_object_name())
        if not blob.exists():
            return None, None
        data = blob.download_as_bytes()
        blob.reload()
        stamp = (blob.metadata or {}).get("fetched_at")
        fetched_at = datetime.fromisoformat(stamp) if stamp else None
        return data, fetched_at
    except Exception:
        logger.exception("Google logo: failed reading cached object")
        return None, None


def _write_bucket(data: bytes, fetched_at: datetime) -> None:
    bucket = _bucket()
    if bucket is None:
        return
    try:
        blob = bucket.blob(_object_name())
        blob.metadata = {"fetched_at": fetched_at.isoformat()}
        blob.upload_from_string(data, content_type="image/png")
    except Exception:
        logger.exception("Google logo: failed writing cached object")


async def _fetch_remote() -> Optional[bytes]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(_source_url())
    except Exception:
        logger.exception("Google logo: fetch failed")
        return None
    if resp.status_code == 200 and resp.content:
        return resp.content
    logger.warning("Google logo: source returned status %s", resp.status_code)
    return None


def _read_cache() -> Tuple[Optional[bytes], Optional[datetime]]:
    data, fetched_at = _read_bucket()
    if data is not None:
        return data, fetched_at
    return _memory_cache["data"], _memory_cache["fetched_at"]


def _store_cache(data: bytes, fetched_at: datetime) -> None:
    _memory_cache["data"] = data
    _memory_cache["fetched_at"] = fetched_at
    _write_bucket(data, fetched_at)


async def get_logo() -> Optional[bytes]:
    cached, fetched_at = _read_cache()
    age = _age_seconds(fetched_at)
    if cached is not None and age is not None and age < MAX_AGE_SECONDS:
        return cached

    fresh = await _fetch_remote()
    if fresh is not None:
        _store_cache(fresh, _now())
        return fresh

    return cached
