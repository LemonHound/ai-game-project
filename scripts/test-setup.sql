-- Test data setup — runs after alembic upgrade head
-- No DDL here; schema is managed exclusively by Alembic migrations.

-- Demo user (password: demo123)
INSERT INTO users (username, email, password_hash, display_name, email_verified, auth_provider)
VALUES ('demo', 'demo@aigamehub.com', '$2b$12$KrfU4z6FgEFr8dK8qK/RSOKMS560sO1Pd2OtSWBGamypeMaYsJj3W', 'Demo Player', true, 'local')
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    display_name = EXCLUDED.display_name,
    email_verified = EXCLUDED.email_verified,
    auth_provider = EXCLUDED.auth_provider;

-- Test user (password: test123)
INSERT INTO users (username, email, password_hash, display_name, email_verified, auth_provider)
VALUES ('test', 'test@example.com', '$2b$12$KrfU4z6FgEFr8dK8qK/RSOKMS560sO1Pd2OtSWBGamypeMaYsJj3W', 'Test User', true, 'local')
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    display_name = EXCLUDED.display_name,
    email_verified = EXCLUDED.email_verified,
    auth_provider = EXCLUDED.auth_provider;

-- Player1 user (password: player123)
INSERT INTO users (username, email, password_hash, display_name, email_verified, auth_provider)
VALUES ('player1', 'player1@example.com', '$2b$12$KrfU4z6FgEFr8dK8qK/RSOKMS560sO1Pd2OtSWBGamypeMaYsJj3W', 'Player One', true, 'local')
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    display_name = EXCLUDED.display_name,
    email_verified = EXCLUDED.email_verified,
    auth_provider = EXCLUDED.auth_provider;
