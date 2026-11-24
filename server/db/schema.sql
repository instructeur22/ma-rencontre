PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

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
  last_active_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS swipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('pass', 'like', 'super_like')),
  revealed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(actor_id, target_id),
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  user_a TEXT NOT NULL,
  user_b TEXT NOT NULL,
  compatibility_score INTEGER DEFAULT 80,
  is_super_match INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_a, user_b),
  FOREIGN KEY (user_a) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (user_b) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  msg_type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  media_url TEXT DEFAULT '',
  metadata_json TEXT DEFAULT '{}',
  scam_flagged INTEGER DEFAULT 0,
  scam_reason TEXT DEFAULT '',
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS safety_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  challenge_code TEXT NOT NULL,
  challenge_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'verified',
  selfie_snapshot TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS blocks_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK(action_type IN ('block', 'report')),
  reason TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tx_type TEXT NOT NULL CHECK(tx_type IN ('credit', 'debit')),
  amount_cauris INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
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
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
  spot_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  partner_id TEXT DEFAULT '',
  booking_date TEXT NOT NULL,
  guests_count INTEGER DEFAULT 2,
  total_xof INTEGER NOT NULL,
  payment_reference TEXT DEFAULT '',
  status TEXT DEFAULT 'confirmed',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (spot_id) REFERENCES safe_date_spots(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_swipes_actor ON swipes(actor_id);
CREATE INDEX IF NOT EXISTS idx_swipes_target ON swipes(target_id);
CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_transactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_ref ON payment_orders(reference);
