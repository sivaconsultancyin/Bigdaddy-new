-- =============================================================================
-- BigDaddy Casino - Supabase Wallet-Only Schema & Atomic RPC Functions
-- Game engines run locally inside the APK; ONLY the Wallet & Ledger live here.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE,
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('TREASURY', 'SUPER_ADMIN', 'ADMIN', 'PLAYER', 'GAME_POOL', 'ESCROW')),
  game_id TEXT,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  reserved_balance BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets (user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_type ON public.wallets (wallet_type);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  source_wallet_id TEXT REFERENCES public.wallets (id),
  target_wallet_id TEXT REFERENCES public.wallets (id),
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES public.wallet_transactions (id),
  wallet_id TEXT NOT NULL REFERENCES public.wallets (id),
  direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  description TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet_ts ON public.wallet_ledger (wallet_id, timestamp DESC);

-- Enable Row Level Security (adjust policies for your Supabase Auth setup if needed)
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow wallet reads" ON public.wallets;
CREATE POLICY "Allow wallet reads" ON public.wallets FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow ledger reads" ON public.wallet_ledger;
CREATE POLICY "Allow ledger reads" ON public.wallet_ledger FOR SELECT USING (true);

-- Atomic double-entry transfer RPC (handles bet escrow locks, win payouts, pool allocations & role transfers)
CREATE OR REPLACE FUNCTION public.wallet_execute_transfer(
  p_source_wallet_id TEXT,
  p_target_wallet_id TEXT,
  p_amount BIGINT,
  p_type TEXT,
  p_idempotency_key TEXT,
  p_description TEXT DEFAULT 'Wallet transfer',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_tx RECORD;
  v_src RECORD;
  v_dst RECORD;
  v_tx_id TEXT;
  v_new_src_balance BIGINT;
  v_new_dst_balance BIGINT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be positive';
  END IF;

  IF p_source_wallet_id = p_target_wallet_id THEN
    RAISE EXCEPTION 'Source and target wallets cannot be identical';
  END IF;

  -- Idempotency check
  SELECT * INTO v_existing_tx
  FROM public.wallet_transactions
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    SELECT balance INTO v_new_src_balance FROM public.wallets WHERE id = p_source_wallet_id;
    SELECT balance INTO v_new_dst_balance FROM public.wallets WHERE id = p_target_wallet_id;
    RETURN jsonb_build_object(
      'id', v_existing_tx.id,
      'idempotencyKey', v_existing_tx.idempotency_key,
      'type', v_existing_tx.type,
      'amount', v_existing_tx.amount::text,
      'sourceWalletId', v_existing_tx.source_wallet_id,
      'targetWalletId', v_existing_tx.target_wallet_id,
      'status', v_existing_tx.status,
      'sourceBalance', COALESCE(v_new_src_balance, 0)::text,
      'targetBalance', COALESCE(v_new_dst_balance, 0)::text
    );
  END IF;

  -- Deterministic row locking order to avoid deadlocks
  IF p_source_wallet_id < p_target_wallet_id THEN
    SELECT * INTO v_src FROM public.wallets WHERE id = p_source_wallet_id FOR UPDATE;
    SELECT * INTO v_dst FROM public.wallets WHERE id = p_target_wallet_id FOR UPDATE;
  ELSE
    SELECT * INTO v_dst FROM public.wallets WHERE id = p_target_wallet_id FOR UPDATE;
    SELECT * INTO v_src FROM public.wallets WHERE id = p_source_wallet_id FOR UPDATE;
  END IF;

  IF v_src.id IS NULL THEN
    RAISE EXCEPTION 'Source wallet not found: %', p_source_wallet_id;
  END IF;
  IF v_dst.id IS NULL THEN
    RAISE EXCEPTION 'Target wallet not found: %', p_target_wallet_id;
  END IF;
  IF v_src.balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance: available %, required %', v_src.balance, p_amount;
  END IF;

  v_new_src_balance := v_src.balance - p_amount;
  v_new_dst_balance := v_dst.balance + p_amount;
  v_tx_id := 'tx-' || replace(gen_random_uuid()::text, '-', '');

  UPDATE public.wallets SET balance = v_new_src_balance, updated_at = NOW() WHERE id = v_src.id;
  UPDATE public.wallets SET balance = v_new_dst_balance, updated_at = NOW() WHERE id = v_dst.id;

  INSERT INTO public.wallet_transactions (
    id, idempotency_key, type, amount, source_wallet_id, target_wallet_id, status, metadata
  ) VALUES (
    v_tx_id, p_idempotency_key, p_type, p_amount, v_src.id, v_dst.id, 'COMPLETED', COALESCE(p_metadata, '{}'::jsonb)
  );

  INSERT INTO public.wallet_ledger (id, transaction_id, wallet_id, direction, amount, balance_after, description)
  VALUES
    ('led-' || replace(gen_random_uuid()::text, '-', ''), v_tx_id, v_src.id, 'DEBIT', p_amount, v_new_src_balance, p_description),
    ('led-' || replace(gen_random_uuid()::text, '-', ''), v_tx_id, v_dst.id, 'CREDIT', p_amount, v_new_dst_balance, p_description);

  RETURN jsonb_build_object(
    'id', v_tx_id,
    'idempotencyKey', p_idempotency_key,
    'type', p_type,
    'amount', p_amount::text,
    'sourceWalletId', v_src.id,
    'targetWalletId', v_dst.id,
    'status', 'COMPLETED',
    'sourceBalance', v_new_src_balance::text,
    'targetBalance', v_new_dst_balance::text
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wallet_execute_transfer(TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- Ensure a wallet row exists for a user (safe idempotent initializer)
CREATE OR REPLACE FUNCTION public.wallet_ensure_user(
  p_user_id TEXT,
  p_wallet_type TEXT DEFAULT 'PLAYER'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet RECORD;
  v_wallet_id TEXT;
BEGIN
  IF p_user_id IS NULL OR length(trim(p_user_id)) = 0 THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id;
  IF FOUND THEN
    RETURN row_to_json(v_wallet)::jsonb;
  END IF;

  v_wallet_id := 'wallet-user-' || p_user_id;
  INSERT INTO public.wallets (id, user_id, wallet_type, game_id, balance, reserved_balance)
  VALUES (v_wallet_id, p_user_id, p_wallet_type, NULL, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id;
  RETURN row_to_json(v_wallet)::jsonb;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wallet_ensure_user(TEXT, TEXT) TO anon, authenticated;

-- Seed system wallets & demo test wallets (10,000,000,000 strict supply invariant)
INSERT INTO public.wallets (id, user_id, wallet_type, game_id, balance, reserved_balance)
VALUES
  ('wallet-system-treasury', NULL, 'TREASURY', NULL, 9981940000, 0),
  ('wallet-system-escrow', NULL, 'ESCROW', NULL, 0, 0),
  ('wallet-pool-aviator', NULL, 'GAME_POOL', 'game-aviator', 2000000, 0),
  ('wallet-pool-roulette', NULL, 'GAME_POOL', 'game-roulette', 2000000, 0),
  ('wallet-pool-teen-patti', NULL, 'GAME_POOL', 'game-teen-patti', 2000000, 0),
  ('wallet-pool-dice', NULL, 'GAME_POOL', 'game-dice', 2000000, 0),
  ('wallet-pool-dragon-tiger', NULL, 'GAME_POOL', 'game-dragon-tiger', 2000000, 0),
  ('wallet-pool-andar-bahar', NULL, 'GAME_POOL', 'game-andar-bahar', 2000000, 0),
  ('wallet-user-user-superadmin-001', 'user-superadmin-001', 'SUPER_ADMIN', NULL, 4000000, 0),
  ('wallet-user-user-admin-001', 'user-admin-001', 'ADMIN', NULL, 940000, 0),
  ('wallet-user-user-player-001', 'user-player-001', 'PLAYER', NULL, 10000, 0),
  ('wallet-user-user-player-test', 'user-player-test', 'PLAYER', NULL, 50000, 0)
ON CONFLICT (id) DO NOTHING;
