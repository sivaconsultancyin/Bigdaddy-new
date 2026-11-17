import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  GameInfo,
  GameStatus,
  LedgerDirection,
  LedgerEntry,
  TokenSupplyInfo,
  TransactionType,
  UserRole,
  Wallet,
  WalletTransaction,
  WalletType,
} from '../../../shared/src/types';
import {
  GAMES_CATALOG,
  MAX_TOKEN_SUPPLY,
  MAX_TOKEN_SUPPLY_BIGINT,
  SYSTEM_WALLETS,
} from '../../../shared/src/constants';
import { randomId } from '../utils/rng';

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const LOCAL_STORE_KEY = 'bigdaddy_apk_wallet_store_v1';

interface LocalWalletStore {
  wallets: Record<string, Wallet>;
  transactions: Record<string, WalletTransaction>;
  ledger: LedgerEntry[];
  idempotencyKeys: string[];
}

export type WalletEventListener = (event: {
  walletId?: string;
  userId?: string | null;
  balance?: string;
}) => void;

function mapSupabaseWallet(row: any): Wallet {
  return {
    id: String(row.id),
    userId: row.user_id ?? null,
    walletType: row.wallet_type as WalletType,
    gameId: row.game_id ?? null,
    balance: String(row.balance ?? '0'),
    reservedBalance: String(row.reserved_balance ?? '0'),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

function mapSupabaseLedger(row: any): LedgerEntry {
  return {
    id: String(row.id),
    transactionId: String(row.transaction_id),
    walletId: String(row.wallet_id),
    direction: row.direction as LedgerDirection,
    amount: String(row.amount ?? '0'),
    balanceAfter: String(row.balance_after ?? '0'),
    description: String(row.description || ''),
    timestamp: row.timestamp || new Date().toISOString(),
  };
}

class SupabaseWalletService {
  private supabase: SupabaseClient | null = null;
  private listeners: Set<WalletEventListener> = new Set();
  private localStore: LocalWalletStore | null = null;
  private localIdemCache: Map<string, WalletTransaction> = new Map();

  constructor() {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }
  }

  public get isSupabaseConfigured(): boolean {
    return this.supabase !== null;
  }

  public get providerName(): 'SUPABASE' | 'LOCAL_DEVICE' {
    return this.supabase ? 'SUPABASE' : 'LOCAL_DEVICE';
  }

  public subscribe(listener: WalletEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(info: { walletId?: string; userId?: string | null; balance?: string }) {
    for (const listener of this.listeners) {
      try {
        listener(info);
      } catch {
        // Ignore subscriber error
      }
    }
  }

  // =========================================================================
  // LOCAL FALLBACK LEDGER (Used only when VITE_SUPABASE_* env vars are unset)
  // =========================================================================

  private loadLocalStore(): LocalWalletStore {
    if (this.localStore) return this.localStore;

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(LOCAL_STORE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as LocalWalletStore;
          if (parsed?.wallets && parsed.wallets[SYSTEM_WALLETS.TREASURY]) {
            this.localStore = parsed;
            return this.localStore;
          }
        }
      }
    } catch {
      // Re-seed if storage is unreadable
    }

    const now = new Date().toISOString();
    const wallets: Record<string, Wallet> = {
      [SYSTEM_WALLETS.TREASURY]: {
        id: SYSTEM_WALLETS.TREASURY,
        userId: null,
        walletType: WalletType.TREASURY,
        balance: MAX_TOKEN_SUPPLY,
        reservedBalance: '0',
        createdAt: now,
        updatedAt: now,
      },
      [SYSTEM_WALLETS.BET_ESCROW]: {
        id: SYSTEM_WALLETS.BET_ESCROW,
        userId: null,
        walletType: WalletType.ESCROW,
        balance: '0',
        reservedBalance: '0',
        createdAt: now,
        updatedAt: now,
      },
      'wallet-user-user-superadmin-001': {
        id: 'wallet-user-user-superadmin-001',
        userId: 'user-superadmin-001',
        walletType: WalletType.SUPER_ADMIN,
        balance: '0',
        reservedBalance: '0',
        createdAt: now,
        updatedAt: now,
      },
      'wallet-user-user-admin-001': {
        id: 'wallet-user-user-admin-001',
        userId: 'user-admin-001',
        walletType: WalletType.ADMIN,
        balance: '0',
        reservedBalance: '0',
        createdAt: now,
        updatedAt: now,
      },
      'wallet-user-user-player-001': {
        id: 'wallet-user-user-player-001',
        userId: 'user-player-001',
        walletType: WalletType.PLAYER,
        balance: '0',
        reservedBalance: '0',
        createdAt: now,
        updatedAt: now,
      },
      'wallet-user-user-player-test': {
        id: 'wallet-user-user-player-test',
        userId: 'user-player-test',
        walletType: WalletType.PLAYER,
        balance: '0',
        reservedBalance: '0',
        createdAt: now,
        updatedAt: now,
      },
    };

    for (const game of GAMES_CATALOG) {
      wallets[game.poolWalletId] = {
        id: game.poolWalletId,
        userId: null,
        walletType: WalletType.GAME_POOL,
        gameId: game.id,
        balance: '0',
        reservedBalance: '0',
        createdAt: now,
        updatedAt: now,
      };
    }

    const store: LocalWalletStore = {
      wallets,
      transactions: {
        'tx-genesis-001': {
          id: 'tx-genesis-001',
          idempotencyKey: 'GENESIS_MINT',
          type: TransactionType.SYSTEM_INITIALIZATION,
          amount: MAX_TOKEN_SUPPLY,
          sourceWalletId: null,
          targetWalletId: SYSTEM_WALLETS.TREASURY,
          status: 'COMPLETED',
          createdAt: now,
        },
      },
      ledger: [
        {
          id: 'led-genesis-001',
          transactionId: 'tx-genesis-001',
          walletId: SYSTEM_WALLETS.TREASURY,
          direction: LedgerDirection.CREDIT,
          amount: MAX_TOKEN_SUPPLY,
          balanceAfter: MAX_TOKEN_SUPPLY,
          description: 'Genesis minting into Owner Treasury',
          timestamp: now,
        },
      ],
      idempotencyKeys: ['GENESIS_MINT'],
    };

    this.localStore = store;

    // Seed game pools (2,000,000 each) & test hierarchy balances
    const seedOps: Array<{
      src: string;
      dst: string;
      amt: string;
      type: TransactionType;
      key: string;
      desc: string;
    }> = [
      { src: SYSTEM_WALLETS.TREASURY, dst: SYSTEM_WALLETS.AVIATOR_POOL, amt: '2000000', type: TransactionType.POOL_ALLOCATION, key: 'SEED_POOL_AVIATOR', desc: 'Initial seed allocation to Aviator Game Pool' },
      { src: SYSTEM_WALLETS.TREASURY, dst: SYSTEM_WALLETS.ROULETTE_POOL, amt: '2000000', type: TransactionType.POOL_ALLOCATION, key: 'SEED_POOL_ROULETTE', desc: 'Initial seed allocation to European Roulette Game Pool' },
      { src: SYSTEM_WALLETS.TREASURY, dst: SYSTEM_WALLETS.TEEN_PATTI_POOL, amt: '2000000', type: TransactionType.POOL_ALLOCATION, key: 'SEED_POOL_TEEN_PATTI', desc: 'Initial seed allocation to Teen Patti Game Pool' },
      { src: SYSTEM_WALLETS.TREASURY, dst: SYSTEM_WALLETS.DRAGON_TIGER_POOL, amt: '2000000', type: TransactionType.POOL_ALLOCATION, key: 'SEED_POOL_DRAGON_TIGER', desc: 'Initial seed allocation to Dragon Tiger Game Pool' },
      { src: SYSTEM_WALLETS.TREASURY, dst: SYSTEM_WALLETS.ANDAR_BAHAR_POOL, amt: '2000000', type: TransactionType.POOL_ALLOCATION, key: 'SEED_POOL_ANDAR_BAHAR', desc: 'Initial seed allocation to Andar Bahar Game Pool' },
      { src: SYSTEM_WALLETS.TREASURY, dst: SYSTEM_WALLETS.DICE_POOL, amt: '2000000', type: TransactionType.POOL_ALLOCATION, key: 'SEED_POOL_DICE', desc: 'Initial seed allocation to Lucky 10 Dice Game Pool' },
      { src: SYSTEM_WALLETS.TREASURY, dst: 'wallet-user-user-superadmin-001', amt: '5000000', type: TransactionType.TREASURY_TO_ROLE, key: 'SEED_SA_ALPHA', desc: 'Initial allocation to SuperAdmin Alpha' },
      { src: 'wallet-user-user-superadmin-001', dst: 'wallet-user-user-admin-001', amt: '1000000', type: TransactionType.ROLE_TO_ROLE, key: 'SEED_ADMIN_BRAVO', desc: 'Initial allocation to Admin Bravo' },
      { src: 'wallet-user-user-admin-001', dst: 'wallet-user-user-player-001', amt: '10000', type: TransactionType.ROLE_TO_PLAYER, key: 'SEED_PLAYER_CHARLIE', desc: 'Initial welcome balance to Player Charlie' },
      { src: 'wallet-user-user-admin-001', dst: 'wallet-user-user-player-test', amt: '50000', type: TransactionType.ROLE_TO_PLAYER, key: 'SEED_PLAYER_TEST', desc: 'Initial testing balance to testplayer' },
    ];

    for (const op of seedOps) {
      this.executeLocalTransfer({
        sourceWalletId: op.src,
        targetWalletId: op.dst,
        amount: op.amt,
        type: op.type,
        idempotencyKey: op.key,
        description: op.desc,
      });
    }

    this.saveLocalStore();
    return this.localStore;
  }

  private saveLocalStore() {
    if (!this.localStore) return;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (this.localStore.ledger.length > 500) {
          this.localStore.ledger = this.localStore.ledger.slice(-500);
        }
        if (this.localStore.idempotencyKeys.length > 1000) {
          this.localStore.idempotencyKeys = this.localStore.idempotencyKeys.slice(-1000);
        }
        window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(this.localStore));
      }
    } catch {
      // Ignore storage quota errors
    }
  }

  private executeLocalTransfer(params: {
    sourceWalletId: string;
    targetWalletId: string;
    amount: string;
    type: TransactionType;
    idempotencyKey: string;
    description: string;
    metadata?: Record<string, any>;
  }): WalletTransaction {
    const store = this.loadLocalStore();
    if (store.idempotencyKeys.includes(params.idempotencyKey)) {
      const existing = Object.values(store.transactions).find(
        (t) => t.idempotencyKey === params.idempotencyKey
      );
      if (existing) return existing;
    }

    const amt = BigInt(params.amount);
    if (amt <= 0n) throw new Error('Transfer amount must be positive');

    const src = store.wallets[params.sourceWalletId];
    const dst = store.wallets[params.targetWalletId];
    if (!src) throw new Error(`Source wallet not found: ${params.sourceWalletId}`);
    if (!dst) throw new Error(`Target wallet not found: ${params.targetWalletId}`);
    if (src.id === dst.id) throw new Error('Source and target wallets cannot be the same');

    const srcBal = BigInt(src.balance);
    if (srcBal < amt) {
      throw new Error(`Insufficient balance: available ${srcBal.toString()}, required ${amt.toString()}`);
    }

    const newSrc = srcBal - amt;
    const newDst = BigInt(dst.balance) + amt;
    const now = new Date().toISOString();

    src.balance = newSrc.toString();
    src.updatedAt = now;
    dst.balance = newDst.toString();
    dst.updatedAt = now;

    const txId = randomId('tx');
    const tx: WalletTransaction = {
      id: txId,
      idempotencyKey: params.idempotencyKey,
      type: params.type,
      amount: amt.toString(),
      sourceWalletId: src.id,
      targetWalletId: dst.id,
      status: 'COMPLETED',
      metadata: params.metadata,
      createdAt: now,
    };

    store.transactions[txId] = tx;
    store.idempotencyKeys.push(params.idempotencyKey);

    store.ledger.push(
      {
        id: randomId('led'),
        transactionId: txId,
        walletId: src.id,
        direction: LedgerDirection.DEBIT,
        amount: amt.toString(),
        balanceAfter: newSrc.toString(),
        description: params.description,
        timestamp: now,
      },
      {
        id: randomId('led'),
        transactionId: txId,
        walletId: dst.id,
        direction: LedgerDirection.CREDIT,
        amount: amt.toString(),
        balanceAfter: newDst.toString(),
        description: params.description,
        timestamp: now,
      }
    );

    this.saveLocalStore();
    return tx;
  }

  // =========================================================================
  // PUBLIC UNIFIED WALLET API (Supabase Primary, Local Store Fallback)
  // =========================================================================

  public async getWallet(walletId: string): Promise<Wallet | null> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('wallets')
        .select('*')
        .eq('id', walletId)
        .maybeSingle();
      if (error) throw new Error(`Supabase wallet read failed: ${error.message}`);
      return data ? mapSupabaseWallet(data) : null;
    }

    const store = this.loadLocalStore();
    return store.wallets[walletId] ? { ...store.wallets[walletId] } : null;
  }

  public async getWalletByUserId(userId: string, role?: UserRole): Promise<Wallet | null> {
    if (role === UserRole.OWNER) {
      return this.getWallet(SYSTEM_WALLETS.TREASURY);
    }

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(`Supabase user wallet fetch failed: ${error.message}`);
      if (data) return mapSupabaseWallet(data);

      // Ensure wallet exists via RPC if this is a freshly registered player
      const walletType =
        role === UserRole.SUPER_ADMIN
          ? WalletType.SUPER_ADMIN
          : role === UserRole.ADMIN
          ? WalletType.ADMIN
          : WalletType.PLAYER;
      const { data: ensured, error: ensureErr } = await this.supabase.rpc('wallet_ensure_user', {
        p_user_id: userId,
        p_wallet_type: walletType,
      });
      if (ensureErr) throw new Error(`Supabase wallet init failed: ${ensureErr.message}`);
      return ensured ? mapSupabaseWallet(ensured) : null;
    }

    const store = this.loadLocalStore();
    const existing = Object.values(store.wallets).find((w) => w.userId === userId);
    if (existing) return { ...existing };

    // Auto-create local wallet for new user
    const now = new Date().toISOString();
    const walletType =
      role === UserRole.SUPER_ADMIN
        ? WalletType.SUPER_ADMIN
        : role === UserRole.ADMIN
        ? WalletType.ADMIN
        : WalletType.PLAYER;
    const created: Wallet = {
      id: `wallet-user-${userId}`,
      userId,
      walletType,
      balance: '0',
      reservedBalance: '0',
      createdAt: now,
      updatedAt: now,
    };
    store.wallets[created.id] = created;
    this.saveLocalStore();
    return { ...created };
  }

  public async getPoolBalance(poolWalletId: string): Promise<string> {
    const w = await this.getWallet(poolWalletId);
    return w ? w.balance : '0';
  }

  public async executeTransfer(params: {
    sourceWalletId: string;
    targetWalletId: string;
    amount: string;
    type: TransactionType;
    idempotencyKey: string;
    description: string;
    metadata?: Record<string, any>;
  }): Promise<WalletTransaction> {
    if (this.supabase) {
      const { data, error } = await this.supabase.rpc('wallet_execute_transfer', {
        p_source_wallet_id: params.sourceWalletId,
        p_target_wallet_id: params.targetWalletId,
        p_amount: Number(params.amount),
        p_type: params.type,
        p_idempotency_key: params.idempotencyKey,
        p_description: params.description,
        p_metadata: params.metadata || {},
      });

      if (error) {
        throw new Error(error.message || 'Supabase wallet transfer failed');
      }

      const tx: WalletTransaction = {
        id: String(data?.id || randomId('tx')),
        idempotencyKey: params.idempotencyKey,
        type: params.type,
        amount: String(data?.amount || params.amount),
        sourceWalletId: params.sourceWalletId,
        targetWalletId: params.targetWalletId,
        status: 'COMPLETED',
        metadata: params.metadata,
        createdAt: new Date().toISOString(),
      };

      this.notify({ walletId: params.sourceWalletId, balance: data?.sourceBalance });
      this.notify({ walletId: params.targetWalletId, balance: data?.targetBalance });
      return tx;
    }

    const tx = this.executeLocalTransfer(params);
    const store = this.loadLocalStore();
    const srcWallet = store.wallets[params.sourceWalletId];
    const dstWallet = store.wallets[params.targetWalletId];
    this.notify({ walletId: params.sourceWalletId, userId: srcWallet?.userId, balance: srcWallet?.balance });
    this.notify({ walletId: params.targetWalletId, userId: dstWallet?.userId, balance: dstWallet?.balance });
    return tx;
  }

  public async getLedger(walletId?: string, limit = 50): Promise<LedgerEntry[]> {
    if (this.supabase) {
      let query = this.supabase
        .from('wallet_ledger')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);
      if (walletId) {
        query = query.eq('wallet_id', walletId);
      }
      const { data, error } = await query;
      if (error) throw new Error(`Supabase ledger fetch failed: ${error.message}`);
      return (data || []).map(mapSupabaseLedger);
    }

    const store = this.loadLocalStore();
    const filtered = walletId
      ? store.ledger.filter((e) => e.walletId === walletId)
      : store.ledger;
    return filtered.slice(-limit).reverse();
  }

  public async getSupplySummary(): Promise<TokenSupplyInfo> {
    let wallets: Wallet[] = [];
    if (this.supabase) {
      const { data, error } = await this.supabase.from('wallets').select('*');
      if (error) throw new Error(`Supabase wallet summary failed: ${error.message}`);
      wallets = (data || []).map(mapSupabaseWallet);
    } else {
      wallets = Object.values(this.loadLocalStore().wallets);
    }

    let treasuryBalance = 0n;
    let gamePoolsBalance = 0n;
    let roleWalletsBalance = 0n;
    let escrowBalance = 0n;

    for (const w of wallets) {
      const b = BigInt(w.balance);
      if (w.walletType === WalletType.TREASURY) treasuryBalance += b;
      else if (w.walletType === WalletType.GAME_POOL) gamePoolsBalance += b;
      else if (w.walletType === WalletType.ESCROW) escrowBalance += b;
      else roleWalletsBalance += b;
    }

    const circulating = gamePoolsBalance + roleWalletsBalance + escrowBalance;
    const total = treasuryBalance + circulating;

    return {
      maxSupply: MAX_TOKEN_SUPPLY,
      circulating: circulating.toString(),
      treasuryBalance: treasuryBalance.toString(),
      gamePoolsBalance: gamePoolsBalance.toString(),
      roleWalletsBalance: roleWalletsBalance.toString(),
      escrowBalance: escrowBalance.toString(),
      isSupplyValid: total === MAX_TOKEN_SUPPLY_BIGINT,
    };
  }

  public async getGamesWithPoolBalances(): Promise<GameInfo[]> {
    let walletMap = new Map<string, Wallet>();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('wallets')
        .select('*')
        .eq('wallet_type', WalletType.GAME_POOL);
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const mapped = mapSupabaseWallet(row);
          walletMap.set(mapped.id, mapped);
        }
      }
    } else {
      const store = this.loadLocalStore();
      for (const w of Object.values(store.wallets)) {
        if (w.walletType === WalletType.GAME_POOL) {
          walletMap.set(w.id, w);
        }
      }
    }

    return GAMES_CATALOG.map((g) => {
      const pool = walletMap.get(g.poolWalletId);
      return {
        id: g.id,
        code: g.code,
        name: g.name,
        status: GameStatus.ACTIVE,
        poolWalletId: g.poolWalletId,
        poolBalance: pool ? pool.balance : '0',
        minBet: g.minBet,
        maxBet: g.maxBet,
        description: g.description,
        iconName: g.iconName,
        route: g.route,
      };
    });
  }

  public getIdempotencyCache(key: string): WalletTransaction | undefined {
    return this.localIdemCache.get(key);
  }
}

export const walletService = new SupabaseWalletService();
