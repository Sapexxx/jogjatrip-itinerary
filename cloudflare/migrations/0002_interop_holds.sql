-- I3: additive only. Existing jt_orders/jt_plans/jt_packages remain unchanged.
CREATE TABLE IF NOT EXISTS jt_checkout_requests (
 order_id TEXT PRIMARY KEY NOT NULL,
 key_hash TEXT NOT NULL UNIQUE,
 access_hash TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 execution_mode TEXT NOT NULL CHECK (execution_mode = 'CONTRACT_0_2'),
 intent_json TEXT NOT NULL,
 offers_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jt_order_locks (
 order_id TEXT PRIMARY KEY NOT NULL REFERENCES jt_checkout_requests(order_id),
 owner_hash TEXT,
 fence INTEGER NOT NULL DEFAULT 0 CHECK (fence >= 0),
 purpose TEXT CHECK (purpose IN ('EXECUTE','RECONCILE')),
 expires_ms INTEGER,
 CHECK ((owner_hash IS NULL AND purpose IS NULL AND expires_ms IS NULL) OR
        (owner_hash IS NOT NULL AND purpose IS NOT NULL AND expires_ms IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS jt_interop_operations (
 order_id TEXT NOT NULL REFERENCES jt_checkout_requests(order_id),
 item_index INTEGER NOT NULL CHECK (item_index >= 0),
 provider TEXT NOT NULL CHECK (provider IN ('hotel','wisata','transport')),
 operation TEXT NOT NULL CHECK (operation IN ('HOLD','CONFIRM','RELEASE')),
 idempotency_key TEXT NOT NULL UNIQUE,
 request_hash TEXT NOT NULL,
 hold_id TEXT,
 state TEXT NOT NULL CHECK (state IN ('IN_FLIGHT','SUCCEEDED','REJECTED','UNKNOWN')),
 result_json TEXT,
 error_code TEXT,
 http_status INTEGER,
 revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY (order_id,item_index,operation)
);
CREATE INDEX IF NOT EXISTS idx_jt_interop_operations_state ON jt_interop_operations(order_id,state);
