import pytest

from auth_service import AuthService


@pytest.fixture
def auth():
    return AuthService()


@pytest.mark.asyncio
async def test_auth_password_hash_roundtrip(auth):
    password = "test_password_123"
    hashed = await auth.hash_password(password)
    assert hashed != password
    assert await auth.verify_password(password, hashed) is True


@pytest.mark.asyncio
async def test_auth_wrong_password_fails(auth):
    password = "correct_password"
    hashed = await auth.hash_password(password)
    assert await auth.verify_password("wrong_password", hashed) is False


@pytest.mark.asyncio
async def test_auth_hash_produces_bcrypt_format(auth):
    hashed = await auth.hash_password("some_password")
    assert hashed.startswith("$2b$")


@pytest.mark.asyncio
async def test_auth_different_passwords_different_hashes(auth):
    h1 = await auth.hash_password("password1")
    h2 = await auth.hash_password("password2")
    assert h1 != h2


@pytest.mark.asyncio
async def test_auth_same_password_different_salts(auth):
    h1 = await auth.hash_password("same_password")
    h2 = await auth.hash_password("same_password")
    assert h1 != h2
