-- Jalankan di Supabase SQL Editor (proyek Free).
-- Hanya backend Go dengan service_role key yang diizinkan mengakses tabel.
CREATE TABLE IF NOT EXISTS public.jt_orders (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.jt_orders ENABLE ROW LEVEL SECURITY;
-- Tanpa policy anon/authenticated: hanya role service_role dari backend.
CREATE INDEX IF NOT EXISTS idx_jt_orders_created_at ON public.jt_orders(created_at DESC);


-- JogjaTrip V2 independent itineraries (not duplicated provider reservations)
CREATE TABLE IF NOT EXISTS public.jt_plans (
 id TEXT PRIMARY KEY,
 payload JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.jt_plans ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_jt_plans_created_at ON public.jt_plans(created_at DESC);
-- No anon/authenticated policy. Backend uses service_role only.

-- JogjaTrip package definition is owned by JogjaTrip (JSONB, provider IDs only).
CREATE TABLE IF NOT EXISTS public.jt_packages (
 id TEXT PRIMARY KEY,
 payload JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.jt_packages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_jt_packages_created_at ON public.jt_packages(created_at DESC);
-- No anon/authenticated policies. Only backend service_role may access.
