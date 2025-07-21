
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Game states table
CREATE TABLE IF NOT EXISTS game_states (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    game_data JSONB NOT NULL,
    score INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI training data table
CREATE TABLE IF NOT EXISTS ai_training_data (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    game_state_id INTEGER REFERENCES game_states(id) ON DELETE CASCADE,
    input_data JSONB NOT NULL,
    output_data JSONB NOT NULL,
    model_version VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_game_states_user_id ON game_states(user_id);
CREATE INDEX IF NOT EXISTS idx_game_states_status ON game_states(status);
CREATE INDEX IF NOT EXISTS idx_ai_training_data_user_id ON ai_training_data(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_training_data_game_state_id ON ai_training_data(game_state_id);
CREATE INDEX IF NOT EXISTS idx_ai_training_data_created_at ON ai_training_data(created_at);

-- Insert demo user (password is 'password123')
INSERT INTO users (username, email, password_hash, display_name, email_verified, auth_provider)
VALUES ('demo', 'demo@aigamehub.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeSTtCdJa/0Z1lk6G', 'Demo Player', true, 'local')
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    display_name = EXCLUDED.display_name,
    email_verified = EXCLUDED.email_verified,
    auth_provider = EXCLUDED.auth_provider;

-- Insert test user (password is 'password123')
INSERT INTO users (username, email, password_hash, display_name, email_verified, auth_provider)
VALUES ('test', 'test@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeSTtCdJa/0Z1lk6G', 'Test User', true, 'local')
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    display_name = EXCLUDED.display_name,
    email_verified = EXCLUDED.email_verified,
    auth_provider = EXCLUDED.auth_provider;

INSERT INTO game_states (user_id, game_data, score)
SELECT 1, '{"board": {"state": "initial"}, "moves": []}', 0
WHERE NOT EXISTS (SELECT 1 FROM game_states WHERE user_id = 1);

INSERT INTO game_states (user_id, game_data, score)
SELECT 2, '{"board": {"state": "in_progress"}, "moves": ["move1", "move2"]}', 150
WHERE NOT EXISTS (SELECT 1 FROM game_states WHERE user_id = 2);