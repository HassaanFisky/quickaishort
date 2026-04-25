-- QuickAI Shorts — Create all tables in Neon Postgres
-- Run this in the Neon SQL Editor: https://console.neon.tech

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE subscription_tier AS ENUM ('free', 'pro', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('draft', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Users table
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_user_id  UUID NOT NULL UNIQUE,
  email             TEXT NOT NULL UNIQUE,
  name              TEXT,
  avatar_url        TEXT,
  subscription_tier subscription_tier NOT NULL DEFAULT 'free',
  quota_used        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Projects table
CREATE TABLE IF NOT EXISTS projects (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL DEFAULT 'Untitled Project',
  source_url     TEXT,
  r2_video_key   TEXT,
  thumbnail      TEXT,
  duration       INTEGER,
  timeline_data  JSONB NOT NULL DEFAULT '{"clips":[],"textLayers":[],"audioTracks":[]}',
  status         project_status NOT NULL DEFAULT 'draft',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_supabase_id ON users(supabase_user_id);
