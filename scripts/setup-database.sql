
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

-- Insert sample data for testing (only if not exists)
INSERT INTO users (username, email, password_hash)
SELECT 'testuser', 'test@example.com', '$2a$10$example.hash.here'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'testuser');

INSERT INTO users (username, email, password_hash)
SELECT 'player1', 'player1@example.com', '$2a$10$example.hash.here'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'player1');

INSERT INTO game_states (user_id, game_data, score)
SELECT 1, '{"board": {"state": "initial"}, "moves": []}', 0
WHERE NOT EXISTS (SELECT 1 FROM game_states WHERE user_id = 1);

INSERT INTO game_states (user_id, game_data, score)
SELECT 2, '{"board": {"state": "in_progress"}, "moves": ["move1", "move2"]}', 150
WHERE NOT EXISTS (SELECT 1 FROM game_states WHERE user_id = 2);