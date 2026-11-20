-- New Cloudflare D1 database only; review before applying to an existing production database.
CREATE TABLE IF NOT EXISTS jt_orders (
 id TEXT PRIMARY KEY NOT NULL,
 payload TEXT NOT NULL,
 secret_hash TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jt_plans (
 id TEXT PRIMARY KEY NOT NULL,
 payload TEXT NOT NULL,
 secret_hash TEXT NOT NULL,
 order_lock TEXT,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jt_packages (
 id TEXT PRIMARY KEY NOT NULL,
 payload TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jt_orders_created_at ON jt_orders(created_at);
