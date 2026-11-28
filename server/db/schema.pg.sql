CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  phone TEXT DEFAULT '',
  phone_verified INTEGER DEFAULT 0,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  gender TEXT NOT NULL,
  looking_for TEXT NOT NULL,
  commune TEXT NOT NULL,
  city TEXT NOT NULL,
  country_code TEXT DEFAULT 'CI',
  is_diaspora INTEGER DEFAULT 0,
  passport_active INTEGER DEFAULT 0,
  passport_target_city TEXT DEFAULT '',
  passport_arrival_date TEXT DEFAULT '',
  passport_departure_date TEXT DEFAULT '',
  intention TEXT NOT NULL,
  profession TEXT DEFAULT '',
  bio TEXT NOT NULL,
  secret_prompt TEXT DEFAULT '',
  avatar_url TEXT NOT NULL,
  voice_note_url TEXT DEFAULT '',
  voice_duration_sec INTEGER DEFAULT 0,
  tags_json TEXT DEFAULT '[]',
  vrai_babi_json TEXT DEFAULT '{}',
  tonight_available INTEGER DEFAULT 1,
  tonight_mood TEXT DEFAULT 'Café & discussion à Cocody',
  incognito INTEGER DEFAULT 0,
  verified_225 INTEGER DEFAULT 0,
  trust_score INTEGER DEFAULT 55,
  cauris_balance INTEGER DEFAULT 50,
  subscription_tier TEXT DEFAULT 'free',
  subscription_expires_at TEXT,
  boost_expires_at TEXT,
  referral_code TEXT UNIQUE NOT NULL,
  referred_by TEXT,
  last_checkin_date TEXT,
  checkin_streak INTEGER DEFAULT 0,
  online_status INTEGER DEFAULT 1,
  is_demo_bot INTEGER DEFAULT 0,
  last_active_at TEXT DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  created_at TEXT DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  terms_accepted_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS swipes (
  id SERIAL PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('pass', 'like', 'super_like')),
  revealed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE(actor_id, target_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  compatibility_score INTEGER DEFAULT 80,
  is_super_match INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE(user_a, user_b)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  msg_type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  media_url TEXT DEFAULT '',
  metadata_json TEXT DEFAULT '{}',
  scam_flagged INTEGER DEFAULT 0,
  scam_reason TEXT DEFAULT '',
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS safety_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_code TEXT NOT NULL,
  challenge_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  selfie_snapshot TEXT DEFAULT '',
  image_path TEXT DEFAULT '',
  ai_provider TEXT DEFAULT '',
  ai_confidence REAL DEFAULT 0,
  ai_reason TEXT DEFAULT '',
  ai_details_json TEXT DEFAULT '{}',
  reviewer_note TEXT DEFAULT '',
  reviewed_at TEXT,
  created_at TEXT DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS phone_otp_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  created_at TEXT DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS password_reset_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  channel TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS blocks_reports (
  id SERIAL PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK(action_type IN ('block', 'report')),
  reason TEXT DEFAULT '',
  created_at TEXT DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tx_type TEXT NOT NULL CHECK(tx_type IN ('credit', 'debit')),
  amount_cauris INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference TEXT DEFAULT '',
  created_at TEXT DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'geniuspay',
  payment_method TEXT,
  item_code TEXT NOT NULL,
  item_type TEXT NOT NULL,
  amount_xof INTEGER NOT NULL,
  fees_xof INTEGER DEFAULT 0,
  net_amount_xof INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'XOF',
  status TEXT NOT NULL DEFAULT 'pending',
  checkout_url TEXT DEFAULT '',
  customer_phone TEXT DEFAULT '',
  metadata_json TEXT DEFAULT '{}',
  environment TEXT DEFAULT 'sandbox',
  fulfilled INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS safe_date_spots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  commune TEXT NOT NULL,
  category TEXT NOT NULL,
  vibe TEXT NOT NULL,
  budget_xof TEXT NOT NULL,
  ticket_price_xof INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  perk_akwaba TEXT NOT NULL,
  next_event_title TEXT NOT NULL,
  next_event_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS date_bookings (
  id TEXT PRIMARY KEY,
  spot_id TEXT NOT NULL REFERENCES safe_date_spots(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id TEXT DEFAULT '',
  booking_date TEXT NOT NULL,
  guests_count INTEGER DEFAULT 2,
  total_xof INTEGER NOT NULL,
  payment_reference TEXT DEFAULT '',
  status TEXT DEFAULT 'confirmed',
  created_at TEXT DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS media_files (
  path TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  data BYTEA NOT NULL,
  created_at TEXT DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE INDEX IF NOT EXISTS idx_swipes_actor ON swipes(actor_id);
CREATE INDEX IF NOT EXISTS idx_swipes_target ON swipes(target_id);
CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_transactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_ref ON payment_orders(reference);
CREATE INDEX IF NOT EXISTS idx_phone_otp_user ON phone_otp_challenges(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_user ON password_reset_challenges(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_safety_verif_status ON safety_verifications(status, created_at);
CREATE INDEX IF NOT EXISTS idx_media_user ON media_files(user_id);
