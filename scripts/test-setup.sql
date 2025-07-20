-- ============================================
-- Complete Database Setup Script for AI Game Hub
-- This script creates all tables from scratch
-- ============================================

-- Drop existing tables if they exist (for clean setup)
DROP TABLE IF EXISTS ai_training_data CASCADE;
DROP TABLE IF EXISTS game_states CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================
-- Create Users Table
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- Nullable for OAuth users
    display_name VARCHAR(100),
    google_id VARCHAR(100) UNIQUE,
    profile_picture VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP,
    auth_provider VARCHAR(20) DEFAULT 'local',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Create User Sessions Table
-- ============================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Create Game States Table
-- ============================================
CREATE TABLE IF NOT EXISTS game_states (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    game_data JSONB NOT NULL,
    score INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Create AI Training Data Table
-- ============================================
CREATE TABLE IF NOT EXISTS ai_training_data (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    game_state_id INTEGER REFERENCES game_states(id) ON DELETE CASCADE,
    input_data JSONB NOT NULL,
    output_data JSONB NOT NULL,
    model_version VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Create Indexes for Performance
-- ============================================

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);

-- User sessions indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Game states indexes
CREATE INDEX IF NOT EXISTS idx_game_states_user_id ON game_states(user_id);
CREATE INDEX IF NOT EXISTS idx_game_states_status ON game_states(status);

-- AI training data indexes
CREATE INDEX IF NOT EXISTS idx_ai_training_data_user_id ON ai_training_data(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_training_data_game_state_id ON ai_training_data(game_state_id);
CREATE INDEX IF NOT EXISTS idx_ai_training_data_created_at ON ai_training_data(created_at);

-- ============================================
-- Insert Demo and Test Users
-- ============================================

-- Demo user (password is 'demo123')
INSERT INTO users (username, email, password_hash, display_name, email_verified, auth_provider)
VALUES ('demo', 'demo@aigamehub.com', '$2b$12$KrfU4z6FgEFr8dK8qK/RSOKMS560sO1Pd2OtSWBGamypeMaYsJj3W', 'Demo Player', true, 'local')
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    display_name = EXCLUDED.display_name,
    email_verified = EXCLUDED.email_verified,
    auth_provider = EXCLUDED.auth_provider,
    updated_at = CURRENT_TIMESTAMP;

-- Test user (password is 'test123')
INSERT INTO users (username, email, password_hash, display_name, email_verified, auth_provider)
VALUES ('test', 'test@example.com', '$2b$12$KrfU4z6FgEFr8dK8qK/RSOKMS560sO1Pd2OtSWBGamypeMaYsJj3W', 'Test User', true, 'local')
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    display_name = EXCLUDED.display_name,
    email_verified = EXCLUDED.email_verified,
    auth_provider = EXCLUDED.auth_provider,
    updated_at = CURRENT_TIMESTAMP;

-- Player1 user (password is 'player123')
INSERT INTO users (username, email, password_hash, display_name, email_verified, auth_provider)
VALUES ('player1', 'player1@example.com', '$2b$12$KrfU4z6FgEFr8dK8qK/RSOKMS560sO1Pd2OtSWBGamypeMaYsJj3W', 'Player One', true, 'local')
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    display_name = EXCLUDED.display_name,
    email_verified = EXCLUDED.email_verified,
    auth_provider = EXCLUDED.auth_provider,
    updated_at = CURRENT_TIMESTAMP;

-- ============================================
-- Insert Sample Game States
-- ============================================

-- Get user IDs for sample data
DO $$
DECLARE
    demo_user_id INTEGER;
    test_user_id INTEGER;
    player1_user_id INTEGER;
BEGIN
    -- Get user IDs
    SELECT id INTO demo_user_id FROM users WHERE email = 'demo@aigamehub.com';
    SELECT id INTO test_user_id FROM users WHERE email = 'test@example.com';
    SELECT id INTO player1_user_id FROM users WHERE email = 'player1@example.com';

    -- Insert sample game states if they don't exist
    INSERT INTO game_states (user_id, game_data, score, status)
    SELECT demo_user_id, '{"board": {"state": "initial"}, "moves": [], "game_type": "tic-tac-toe"}', 0, 'active'
    WHERE demo_user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM game_states WHERE user_id = demo_user_id AND game_data->>'game_type' = 'tic-tac-toe');

    INSERT INTO game_states (user_id, game_data, score, status)
    SELECT test_user_id, '{"board": {"state": "in_progress"}, "moves": ["X:0", "O:4", "X:1"], "game_type": "tic-tac-toe"}', 150, 'active'
    WHERE test_user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM game_states WHERE user_id = test_user_id AND game_data->>'game_type' = 'tic-tac-toe');

    INSERT INTO game_states (user_id, game_data, score, status)
    SELECT player1_user_id, '{"board": {"state": "completed"}, "moves": ["X:0", "O:1", "X:3", "O:4", "X:6"], "game_type": "tic-tac-toe", "winner": "X"}', 300, 'completed'
    WHERE player1_user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM game_states WHERE user_id = player1_user_id AND game_data->>'game_type' = 'tic-tac-toe');

END $$;

-- ============================================
-- Create Functions for Cleanup (Optional)
-- ============================================

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Verification Queries
-- ============================================

-- Show table structures
SELECT 'Users table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

SELECT 'User sessions table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'user_sessions'
ORDER BY ordinal_position;

-- Show created users
SELECT 'Created users:' as info;
SELECT id, username, email, display_name, auth_provider, email_verified, created_at
FROM users
ORDER BY id;

-- Show sample game states
SELECT 'Sample game states:' as info;
SELECT gs.id, u.username, gs.game_data->>'game_type' as game_type, gs.score, gs.status, gs.created_at
FROM game_states gs
JOIN users u ON gs.user_id = u.id
ORDER BY gs.id;

-- Show indexes
SELECT 'Created indexes:' as info;
SELECT tablename, indexname
FROM pg_indexes
WHERE tablename IN ('users', 'user_sessions', 'game_states', 'ai_training_data')
ORDER BY tablename, indexname;

SELECT 'Database setup completed successfully!' as final_status;