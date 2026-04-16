-- Create dummy_leaderboard table for admin-managed fake leaderboard
CREATE TABLE IF NOT EXISTS dummy_leaderboard (
  id SERIAL PRIMARY KEY,
  mitra_name TEXT NOT NULL,
  commission_today BIGINT NOT NULL DEFAULT 0,
  rank_position INT NOT NULL DEFAULT 1,
  avatar_emoji TEXT DEFAULT '🤝',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add some sample data
INSERT INTO dummy_leaderboard (mitra_name, commission_today, rank_position, avatar_emoji, is_active) VALUES
  ('Budi', 250000, 1, '🏆', true),
  ('Sari', 180000, 2, '⭐', true),
  ('Andi', 125000, 3, '💎', true),
  ('Dina', 95000, 4, '🔥', true),
  ('Reza', 72000, 5, '🚀', true);
