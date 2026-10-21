SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_key TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_key TEXT,
    auth_version INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    icon_type TEXT NOT NULL DEFAULT 'other',
    purchase_date TEXT NOT NULL,
    warranty_expires_on TEXT,
    purchase_cents INTEGER NOT NULL CHECK (purchase_cents >= 0),
    daily_target_cents INTEGER CHECK (daily_target_cents > 0),
    photo_key TEXT,
    cover_mode TEXT,
    cover_icon_key TEXT,
    payment_info TEXT,
    is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
    deleted_at TEXT,
    storage_location_id INTEGER,
    revision INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'disposed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS usage_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    used_on TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS maintenance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    maintained_on TEXT NOT NULL,
    cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),
    description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS disposal_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
    disposed_on TEXT NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('sold', 'gifted', 'discarded', 'other')),
    proceeds_cents INTEGER NOT NULL CHECK (proceeds_cents >= 0),
    notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS trash_expired (
    item_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expired_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_usage_item ON usage_records(item_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_item ON maintenance_records(item_id);
CREATE TABLE IF NOT EXISTS wechat_identities (
    openid TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS wechat_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_wechat_sessions_expiry ON wechat_sessions(expires_at);
CREATE TABLE IF NOT EXISTS wishlist (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS fixed_expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS expense_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS storage_locations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ledger_entries (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_owner ON ledger_entries(user_id, id);
CREATE TABLE IF NOT EXISTS ledger_settings (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_wishlist_owner ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_owner ON fixed_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_owner ON expense_payments(user_id);
CREATE TABLE IF NOT EXISTS member_documents (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_member_documents_owner_kind ON member_documents(user_id, kind);
CREATE TABLE IF NOT EXISTS pay_orders (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL, next_query_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pay_orders_owner ON pay_orders(user_id, id);
CREATE INDEX IF NOT EXISTS idx_pay_orders_due ON pay_orders(status, next_query_at);
CREATE TABLE IF NOT EXISTS pay_deliveries (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS workflow_receipts (user_id INTEGER NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, response TEXT NOT NULL, status INTEGER NOT NULL, PRIMARY KEY(user_id, request_key));
"""
