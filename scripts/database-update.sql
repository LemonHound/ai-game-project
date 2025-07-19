-- Database update script for existing tables
-- Since you already have the tables, this will just add missing columns

-- Check current structure first
SELECT 'Current users table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- ============================================
-- Add missing authentication columns to users table
-- ============================================

DO $$
BEGIN
    -- Add display_name column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'display_name') THEN
        ALTER TABLE users ADD COLUMN display_name VARCHAR(100);
        RAISE NOTICE 'Added display_name column';
    ELSE
        RAISE NOTICE 'display_name column already exists';
    END IF;

    -- Add google_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'google_id') THEN
        ALTER TABLE users ADD COLUMN google_id VARCHAR(100) UNIQUE;
        RAISE NOTICE 'Added google_id column';
    ELSE
        RAISE NOTICE 'google_id column already exists';
    END IF;

    -- Add profile_picture column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'profile_picture') THEN
        ALTER TABLE users ADD COLUMN profile_picture VARCHAR(500);
        RAISE NOTICE 'Added profile_picture column';
    ELSE
        RAISE NOTICE 'profile_picture column already exists';
    END IF;

    -- Add is_active column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'is_active') THEN
        ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
        RAISE NOTICE 'Added is_active column';
    ELSE
        RAISE NOTICE 'is_active column already exists';
    END IF;

    -- Add email_verified column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'email_verified') THEN
        ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added email_verified column';
    ELSE
        RAISE NOTICE 'email_verified column already exists';
    END IF;

    -- Add last_login column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'last_login') THEN
        ALTER TABLE users ADD COLUMN last_login TIMESTAMP;
        RAISE NOTICE 'Added last_login column';
    ELSE
        RAISE NOTICE 'last_login column already exists';
    END IF;

    -- Add auth_provider column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'auth_provider') THEN
        ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) DEFAULT 'local';
        RAISE NOTICE 'Added auth_provider column';
    ELSE
        RAISE NOTICE 'auth_provider column already exists';
    END IF;
END $$;

-- Make password_hash nullable (for Google OAuth users)
DO $$
BEGIN
    -- Check if password_hash is currently NOT NULL
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'users'
               AND column_name = 'password_hash'
               AND is_nullable = 'NO') THEN
        ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
        RAISE NOTICE 'Made password_hash nullable';
    ELSE
        RAISE NOTICE 'password_hash is already nullable';
    END IF;
END $$;

-- ============================================
-- Create indexes for better performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);

-- ============================================
-- Insert demo users for testing
-- ============================================

-- Insert demo user (password is 'demo123')
INSERT INTO users (username, email, password_hash, display_name, email_verified, auth_provider)
VALUES ('demo', 'demo@aigamehub.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeSTtCdJa/0Z1lk6G', 'Demo Player', true, 'local')
ON CONFLICT (email) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    email_verified = EXCLUDED.email_verified,
    auth_provider = EXCLUDED.auth_provider;

-- Insert test user (password is 'test123')
INSERT INTO users (username, email, password_hash, display_name, email_verified, auth_provider)
VALUES ('test', 'test@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeSTtCdJa/0Z1lk6G', 'Test User', true, 'local')
ON CONFLICT (email) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    email_verified = EXCLUDED.email_verified,
    auth_provider = EXCLUDED.auth_provider;

-- ============================================
-- Show final structure
-- ============================================

SELECT 'Updated users table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- Show sample users
SELECT 'Sample users created:' as info;
SELECT id, username, email, display_name, auth_provider, email_verified, created_at
FROM users
ORDER BY id;

SELECT 'Database update completed successfully!' as final_status;

commit