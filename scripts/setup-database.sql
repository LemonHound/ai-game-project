-- ============================================
-- Complete Database Setup Script for AI Game Hub
-- Run this script to set up everything from scratch
-- ============================================

-- Drop existing tables if they exist (for clean setup)
-- Commenting out since we don't want to delete user data if updating the database
/*
DROP TABLE IF EXISTS tic_tac_toe_games CASCADE;
DROP TABLE IF EXISTS tic_tac_toe_states CASCADE;
DROP TABLE IF EXISTS ai_training_data CASCADE;
DROP TABLE IF EXISTS game_states CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
*/

-- Drop existing functions
DROP FUNCTION IF EXISTS cleanup_expired_sessions();
DROP FUNCTION IF EXISTS cleanup_abandoned_tic_tac_toe_games();
DROP FUNCTION IF EXISTS upsert_tic_tac_toe_state(CHAR(9), SMALLINT);
DROP FUNCTION IF EXISTS start_tic_tac_toe_game(INTEGER, VARCHAR(50), BOOLEAN, VARCHAR(20));
DROP FUNCTION IF EXISTS complete_tic_tac_toe_game(VARCHAR(50), TEXT, CHAR(1), SMALLINT, INTEGER, INTEGER);

-- ============================================
-- Create Users Table
-- ============================================
CREATE TABLE users (
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
CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Create Game States Table (Original)
-- ============================================
CREATE TABLE game_states (
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
CREATE TABLE ai_training_data (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    game_state_id INTEGER REFERENCES game_states(id) ON DELETE CASCADE,
    input_data JSONB NOT NULL,
    output_data JSONB NOT NULL,
    model_version VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Create Tic Tac Toe Tables
-- ============================================

-- Game states table for AI training (every move state)
CREATE TABLE tic_tac_toe_states (
    id SERIAL PRIMARY KEY,
    game_state_hash CHAR(32) UNIQUE NOT NULL,  -- MD5 hash of board state
    board_positions CHAR(9) NOT NULL,          -- 9 chars: 'X', 'O', or '_' for empty
    move_count SMALLINT NOT NULL,              -- Number of moves made (0-9)
    count INTEGER DEFAULT 1,                   -- Times this state was reached
    rating REAL DEFAULT 0.0 CHECK (rating >= -1.0 AND rating <= 1.0), -- AI evaluation
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player games table (complete game records)
CREATE TABLE tic_tac_toe_games (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    game_session_id VARCHAR(50) UNIQUE NOT NULL,
    move_sequence TEXT,                        -- "X:0,O:4,X:1,O:5,X:2" - full game
    winner CHAR(1) CHECK (winner IN ('X', 'O', 'T')), -- 'X', 'O', or 'T' (tie)
    total_moves SMALLINT,
    player_started BOOLEAN DEFAULT true,
    difficulty_level VARCHAR(20) DEFAULT 'medium',
    final_score INTEGER DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL                -- NULL for incomplete games
);

-- ============================================
-- Create Indexes for Performance
-- ============================================

-- Users table indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_auth_provider ON users(auth_provider);

-- User sessions indexes
CREATE INDEX idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Game states indexes
CREATE INDEX idx_game_states_user_id ON game_states(user_id);
CREATE INDEX idx_game_states_status ON game_states(status);

-- AI training data indexes
CREATE INDEX idx_ai_training_data_user_id ON ai_training_data(user_id);
CREATE INDEX idx_ai_training_data_game_state_id ON ai_training_data(game_state_id);
CREATE INDEX idx_ai_training_data_created_at ON ai_training_data(created_at);

-- Tic Tac Toe specific indexes
CREATE UNIQUE INDEX idx_ttt_game_state_hash ON tic_tac_toe_states(game_state_hash);
CREATE INDEX idx_ttt_states_move_count ON tic_tac_toe_states(move_count);
CREATE INDEX idx_ttt_states_updated_at ON tic_tac_toe_states(updated_at);
CREATE UNIQUE INDEX idx_ttt_games_session_id ON tic_tac_toe_games(game_session_id);
CREATE INDEX idx_ttt_games_user_id ON tic_tac_toe_games(user_id);
CREATE INDEX idx_ttt_games_started_at ON tic_tac_toe_games(started_at);
CREATE INDEX idx_ttt_games_completed_at ON tic_tac_toe_games(completed_at);
CREATE INDEX idx_ttt_games_incomplete ON tic_tac_toe_games(started_at) WHERE completed_at IS NULL;

-- ============================================
-- Create Database Functions
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

-- Function to clean up abandoned tic tac toe games
CREATE OR REPLACE FUNCTION cleanup_abandoned_tic_tac_toe_games()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM tic_tac_toe_games
    WHERE completed_at IS NULL
    AND started_at < NOW() - INTERVAL '10 minutes';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to insert or update game state
CREATE OR REPLACE FUNCTION upsert_tic_tac_toe_state(
    p_board_positions CHAR(9),
    p_move_count SMALLINT
)
RETURNS INTEGER AS $$
DECLARE
    state_hash CHAR(32);
    state_id INTEGER;
BEGIN
    -- Calculate MD5 hash of board positions
    state_hash := MD5(p_board_positions);

    -- Insert or update state
    INSERT INTO tic_tac_toe_states (game_state_hash, board_positions, move_count)
    VALUES (state_hash, p_board_positions, p_move_count)
    ON CONFLICT (game_state_hash) DO UPDATE SET
        count = tic_tac_toe_states.count + 1,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO state_id;

    RETURN state_id;
END;
$$ LANGUAGE plpgsql;

-- Function to start a new game
CREATE OR REPLACE FUNCTION start_tic_tac_toe_game(
    p_user_id INTEGER,
    p_game_session_id VARCHAR(50),
    p_player_started BOOLEAN DEFAULT true,
    p_difficulty_level VARCHAR(20) DEFAULT 'medium'
)
RETURNS INTEGER AS $$
DECLARE
    game_id INTEGER;
BEGIN
    INSERT INTO tic_tac_toe_games (
        user_id,
        game_session_id,
        player_started,
        difficulty_level
    )
    VALUES (p_user_id, p_game_session_id, p_player_started, p_difficulty_level)
    RETURNING id INTO game_id;

    RETURN game_id;
END;
$$ LANGUAGE plpgsql;

-- Function to complete a game (handles missing games)
CREATE OR REPLACE FUNCTION complete_tic_tac_toe_game(
    p_game_session_id VARCHAR(50),
    p_move_sequence TEXT,
    p_winner CHAR(1),
    p_total_moves SMALLINT,
    p_final_score INTEGER DEFAULT 0,
    p_user_id INTEGER DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    game_id INTEGER;
BEGIN
    -- Try to update existing game
    UPDATE tic_tac_toe_games
    SET
        move_sequence = p_move_sequence,
        winner = p_winner,
        total_moves = p_total_moves,
        final_score = p_final_score,
        completed_at = CURRENT_TIMESTAMP
    WHERE game_session_id = p_game_session_id
    RETURNING id INTO game_id;

    -- If no game found, create new record (handle race condition with cleanup)
    IF game_id IS NULL THEN
        INSERT INTO tic_tac_toe_games (
            user_id,
            game_session_id,
            move_sequence,
            winner,
            total_moves,
            final_score,
            started_at,
            completed_at
        )
        VALUES (
            p_user_id,
            p_game_session_id,
            p_move_sequence,
            p_winner,
            p_total_moves,
            p_final_score,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        RETURNING id INTO game_id;
    END IF;

    RETURN game_id;
END;
$$ LANGUAGE plpgsql;


SELECT 'Database setup completed successfully!' as status;


-- ============================================
-- Verification Queries
-- ============================================

-- Show table counts
SELECT 'Tables created:' as info;
SELECT
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name LIKE '%users%') as user_tables,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name LIKE '%tic_tac_toe%') as ttt_tables,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name LIKE '%game%') as game_tables;

-- Show users created
SELECT 'Users created:' as info;
SELECT id, username, email, display_name, auth_provider, email_verified
FROM users
ORDER BY id;

-- Show functions created
SELECT 'Functions created:' as info;
SELECT proname as function_name
FROM pg_proc
WHERE proname LIKE '%tic_tac_toe%' OR proname LIKE '%cleanup%'
ORDER BY proname;