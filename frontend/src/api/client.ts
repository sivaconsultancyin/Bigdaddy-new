import {
  User,
  UserRole,
  AppConfigInfo,
  AppMode,
  AdminPaymentInfo,
  TransactionType,
} from '../../../shared/src/types';
import { GAMES_CATALOG, SYSTEM_WALLETS } from '../../../shared/src/constants';
import { walletService } from '../services/supabaseWallet';
import { randomId } from '../utils/rng';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const SESSION_USER_KEY = 'bigdaddy_active_user_v1';

interface LocalDirectoryUser extends User {
  password?: string;
}

const DEFAULT_DIRECTORY_USERS: LocalDirectoryUser[] = [
  {
    id: 'user-owner-001',
    username: 'owner',
    email: 'owner@bigdaddy.casino',
    role: UserRole.OWNER,
    parentId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-superadmin-001',
    username: 'superadmin_alpha',
    email: 'superadmin@bigdaddy.casino',
    role: UserRole.SUPER_ADMIN,
    parentId: 'user-owner-001',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-admin-001',
    username: 'admin_bravo',
    email: 'admin@bigdaddy.casino',
    role: UserRole.ADMIN,
    parentId: 'user-superadmin-001',
    upiId: 'admin.bravo@oksbi',
    paymentAccountName: 'BigDaddy Admin Bravo Official',
    upiQrCode:
      'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=admin.bravo@oksbi%26pn=BigDaddy%20Admin%20Bravo%26cu=INR',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-player-001',
    username: 'player_charlie',
    email: 'charlie@gmail.com',
    role: UserRole.PLAYER,
    parentId: 'user-admin-001',
    referralCode: 'BIGDADDY777',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-player-test',
    username: 'testplayer',
    email: 'testplayer@bigdaddy.casino',
    role: UserRole.PLAYER,
    parentId: 'user-admin-001',
    referralCode: 'TEST777',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const DEFAULT_PASSWORDS: Record<string, string> = {
  owner: 'Owner@1234',
  superadmin_alpha: 'SuperAdmin@1234',
  admin_bravo: 'Admin@1234',
  player_charlie: 'Player@1234',
  testplayer: 'Test@1234',
};

export class ApiRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export class ApiClient {
  private static pendingIdempotencyKeys = new Map<string, string>();
  private static pendingIdempotencyPromises = new Map<string, Promise<string>>();
  private static pendingIdempotencyStorageKeys = new Map<string, string>();
  private static currentUser: User | null = null;

  public static setCurrentSessionUser(user: User | null) {
    this.currentUser = user;
    try {
      if (user) {
        localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(SESSION_USER_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }

  public static getCurrentSessionUser(): User | null {
    if (this.currentUser) return this.currentUser;
    try {
      const raw = localStorage.getItem(SESSION_USER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as User;
        if (parsed?.id && parsed?.role) {
          this.currentUser = parsed;
          return parsed;
        }
      }
    } catch {
      // Ignore storage errors
    }
    return null;
  }

  public static requireCurrentUser(): User {
    const user = this.getCurrentSessionUser();
    if (!user) {
      throw new Error('Authentication required. Please sign in.');
    }
    return user;
  }

  public static async pendingKey(operation: string, prefix: string): Promise<string> {
    const existing = this.pendingIdempotencyKeys.get(operation);
    if (existing) return existing;
    const inFlight = this.pendingIdempotencyPromises.get(operation);
    if (inFlight) return inFlight;

    const pending = (async () => {
      let storageKey: string | null = null;
      try {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(operation));
        const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        storageKey = `bigdaddy_pending_idempotency_${fingerprint}`;
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          this.pendingIdempotencyKeys.set(operation, stored);
          this.pendingIdempotencyStorageKeys.set(operation, storageKey);
          return stored;
        }
      } catch {
        // Continue with an in-memory key when browser storage is unavailable.
      }

      const key = `${prefix}_${randomId('id')}`;
      this.pendingIdempotencyKeys.set(operation, key);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, key);
          this.pendingIdempotencyStorageKeys.set(operation, storageKey);
        } catch {
          // Ignore storage errors
        }
      }
      return key;
    })();
    this.pendingIdempotencyPromises.set(operation, pending);
    try {
      return await pending;
    } finally {
      this.pendingIdempotencyPromises.delete(operation);
    }
  }

  public static clearPendingKey(operation: string) {
    this.pendingIdempotencyKeys.delete(operation);
    const storageKey = this.pendingIdempotencyStorageKeys.get(operation);
    this.pendingIdempotencyStorageKeys.delete(operation);
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Ignore storage errors
      }
    }
  }

  public static getToken(): string | null {
    return localStorage.getItem('bigdaddy_auth_token');
  }

  public static setToken(token: string) {
    localStorage.setItem('bigdaddy_auth_token', token);
  }

  public static clearToken() {
    localStorage.removeItem('bigdaddy_auth_token');
    this.setCurrentSessionUser(null);
  }

  public static async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!API_BASE) {
      throw new Error('API base URL is not configured.');
    }
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        signal: options.signal ?? controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json() : null;

      if (!response.ok) {
        throw new ApiRequestError(response.status, data?.message || data?.error || `API request failed (${response.status})`);
      }

      return data as T;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('Server request timed out.');
      }
      if (error instanceof TypeError) {
        throw new Error('Server unreachable.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  // Config Info (works cleanly in standalone APK even with no Express backend)
  public static async getConfig(): Promise<AppConfigInfo> {
    try {
      if (typeof window !== 'undefined' && !window.location.protocol.startsWith('http')) {
        throw new Error('APK local WebView');
      }
      return await this.request<AppConfigInfo>('/config');
    } catch {
      return {
        mode: walletService.isSupabaseConfigured ? AppMode.PRODUCTION : AppMode.DEVELOPMENT_PREVIEW,
        isSimulated: !walletService.isSupabaseConfigured,
        databaseConnected: walletService.isSupabaseConfigured,
        authProvider: 'SIMULATED_LOCAL',
        version: '2.0.0-apk',
      };
    }
  }

  // Auth (tries backend first when running in web server, seamlessly falls back to in-APK auth;
  // authoritative Wallet is ALWAYS resolved from Supabase WalletService)
  public static async login(credentials: { username: string; password: string }) {
    const cleanUsername = String(credentials.username || '').trim().toLowerCase();
    try {
      if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
        const res = await this.request('/auth/login', {
          method: 'POST',
          body: JSON.stringify(credentials),
        });
        if (res?.user) {
          this.setCurrentSessionUser(res.user);
          const supaWallet = await walletService.getWalletByUserId(res.user.id, res.user.role).catch(() => null);
          return {
            ...res,
            wallet: supaWallet ?? res.wallet,
          };
        }
      }
    } catch (err) {
      // If server returned an explicit invalid credentials error (401/403), rethrow unless offline
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
        throw err;
      }
    }

    // Standalone APK / Offline login verification against local directory
    const localUser = DEFAULT_DIRECTORY_USERS.find(
      (u) => u.username.toLowerCase() === cleanUsername
    );
    const expectedPass = localUser ? DEFAULT_PASSWORDS[localUser.username] : undefined;
    if (!localUser || expectedPass !== credentials.password) {
      throw new Error('Invalid username or password');
    }

    const token = `apk-session-${localUser.id}-${Date.now()}`;
    this.setCurrentSessionUser(localUser);
    const wallet = await walletService.getWalletByUserId(localUser.id, localUser.role);
    return { token, user: localUser, wallet };
  }

  public static registerReferral(payload: {
    username: string;
    email: string;
    password: string;
    referralCode: string;
  }) {
    return this.request('/auth/register-referral', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public static createUser(payload: {
    username: string;
    email: string;
    password: string;
    role: string;
    initialTokens?: string;
  }) {
    return this.request('/auth/create-user', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public static async getMe() {
    const token = this.getToken();
    const cachedUser = this.getCurrentSessionUser();
    if (token?.startsWith('apk-session-') && cachedUser) {
      const wallet = await walletService.getWalletByUserId(cachedUser.id, cachedUser.role);
      return { user: cachedUser, wallet };
    }

    try {
      const data = await this.request('/auth/me');
      if (data?.user) {
        this.setCurrentSessionUser(data.user);
        const wallet = await walletService.getWalletByUserId(data.user.id, data.user.role).catch(() => data.wallet);
        return { user: data.user, wallet: wallet ?? data.wallet };
      }
      return data;
    } catch (err) {
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
        throw err;
      }
      if (cachedUser) {
        const wallet = await walletService.getWalletByUserId(cachedUser.id, cachedUser.role);
        return { user: cachedUser, wallet };
      }
      throw err;
    }
  }

  public static async getUsers() {
    try {
      return await this.request('/auth/users');
    } catch {
      return { users: DEFAULT_DIRECTORY_USERS };
    }
  }

  // =========================================================================
  // WALLETS & LEDGER — Strictly backed by Supabase WalletService!
  // =========================================================================

  public static async getMyWallet() {
    const user = this.requireCurrentUser();
    const wallet = await walletService.getWalletByUserId(user.id, user.role);
    if (!wallet) {
      throw new Error('Wallet not found in Supabase');
    }
    return { wallet };
  }

  public static async getSupplySummary() {
    return walletService.getSupplySummary();
  }

  public static async getLedger() {
    const user = this.requireCurrentUser();
    if (user.role === UserRole.OWNER) {
      const entries = await walletService.getLedger(undefined, 100);
      return { entries };
    }
    const wallet = await walletService.getWalletByUserId(user.id, user.role);
    if (!wallet) return { entries: [] };
    const entries = await walletService.getLedger(wallet.id, 50);
    return { entries };
  }

  public static async transferTokens(payload: { recipientId: string; amount: string; note?: string }) {
    const sender = this.requireCurrentUser();
    if (sender.role === UserRole.PLAYER) {
      throw new Error('Players cannot execute direct outbound transfers');
    }

    const operation = `wallet-transfer:${sender.id}:${JSON.stringify(payload)}`;
    const idempotencyKey = await this.pendingKey(operation, 'TRANSFER');

    const senderWallet = await walletService.getWalletByUserId(sender.id, sender.role);
    const targetWallet = await walletService.getWalletByUserId(payload.recipientId);
    if (!senderWallet || !targetWallet) {
      throw new Error('Wallets not available in Supabase');
    }

    const tx = await walletService.executeTransfer({
      sourceWalletId: senderWallet.id,
      targetWalletId: targetWallet.id,
      amount: String(payload.amount),
      type:
        sender.role === UserRole.OWNER
          ? TransactionType.TREASURY_TO_ROLE
          : sender.role === UserRole.SUPER_ADMIN
          ? TransactionType.ROLE_TO_ROLE
          : TransactionType.ROLE_TO_PLAYER,
      idempotencyKey,
      description: `Transfer from ${sender.username}: ${payload.note || ''}`.trim(),
      metadata: { senderId: sender.id, recipientId: payload.recipientId, note: payload.note },
    });

    this.clearPendingKey(operation);
    const updatedSenderWallet = await walletService.getWallet(senderWallet.id);
    return {
      message: `Successfully transferred ${payload.amount} tokens`,
      transaction: tx,
      senderWallet: updatedSenderWallet,
    };
  }

  // Token Requests
  public static createTokenRequest(payload: { amount: string; note?: string; proofScreenshot?: string }) {
    return this.request('/requests/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public static async getTokenRequests() {
    try {
      return await this.request('/requests/list');
    } catch {
      return { requests: [] };
    }
  }

  public static approveTokenRequest(id: string, payload?: { decisionNote?: string }) {
    return this.request(`/requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  public static rejectTokenRequest(id: string, payload?: { decisionNote?: string }) {
    return this.request(`/requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // Admin Payment Details (UPI & QR Photo)
  public static async getAdminPaymentInfo(): Promise<AdminPaymentInfo> {
    try {
      return await this.request('/auth/admin-payment-info');
    } catch {
      const admin = DEFAULT_DIRECTORY_USERS.find((u) => u.role === UserRole.ADMIN)!;
      return {
        adminId: admin.id,
        adminUsername: admin.username,
        upiId: admin.upiId || 'admin.bravo@oksbi',
        upiQrCode: admin.upiQrCode || null,
        paymentAccountName: admin.paymentAccountName || 'BigDaddy Admin Official',
      };
    }
  }

  public static updatePaymentDetails(payload: {
    upiId?: string;
    upiQrCode?: string;
    paymentAccountName?: string;
  }): Promise<{ message: string; user: User }> {
    return this.request('/auth/payment-details', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  // Games & Pools (Live pool balances fetched from Supabase WalletService; game engines live inside APK)
  public static async getGames() {
    const games = await walletService.getGamesWithPoolBalances();
    return { games };
  }

  public static async allocatePool(payload: { gameId?: string; gameCode?: string; amount: string }) {
    const owner = this.requireCurrentUser();
    if (owner.role !== UserRole.OWNER) {
      throw new Error('Only Owner can allocate game pool funds');
    }

    const rawCode = String(payload.gameCode || 'aviator').trim().toLowerCase().replace(/_/g, '-');
    const game = GAMES_CATALOG.find((g) => g.code === rawCode);
    if (!game) {
      throw new Error(`Unknown game code: ${rawCode}`);
    }

    const operation = `pool-allocation:${rawCode}:${String(payload.amount).trim()}`;
    const idempotencyKey = await this.pendingKey(operation, `POOL_ALLOCATION_${rawCode}`);

    const tx = await walletService.executeTransfer({
      sourceWalletId: SYSTEM_WALLETS.TREASURY,
      targetWalletId: game.poolWalletId,
      amount: String(payload.amount).trim(),
      type: TransactionType.POOL_ALLOCATION,
      idempotencyKey,
      description: `Owner pool allocation to ${game.name}`,
      metadata: { gameId: game.id, gameCode: game.code, ownerId: owner.id },
    });

    this.clearPendingKey(operation);
    const poolBalance = await walletService.getPoolBalance(game.poolWalletId);

    return {
      transactionId: tx.id,
      poolBalance,
      gameCode: game.code,
      status: 'ACTIVE',
    };
  }

  // Audit
  public static async getAuditLogs() {
    try {
      return await this.request('/audit/logs');
    } catch {
      return { logs: [] };
    }
  }
}
