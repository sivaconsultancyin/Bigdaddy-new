import {
  AviatorBet,
  BetStatus,
  RoundStatus,
  TransactionType,
  UserRole,
} from '../../../../shared/src/types';
import { SYSTEM_WALLETS } from '../../../../shared/src/constants';
import { walletService } from '../../services/supabaseWallet';
import { hmacSha256Hex, randomBytesHex, randomId, sha256Hex } from '../../utils/rng';

export type AviatorEventListener = (event: string, data: any) => void;

interface InternalAviatorRound {
  id: string;
  roundNumber: number;
  status: RoundStatus;
  multiplier: number;
  crashMultiplier: number;
  startedAtMs: number | null;
  crashedAtMs: number | null;
  totalBetsCount: number;
  totalBetAmount: string;
  tickSequence: number;
  serverSeed: string;
  serverSeedHash: string;
}

export class ApkAviatorEngine {
  private currentRound: InternalAviatorRound;
  private currentBets: Map<string, AviatorBet> = new Map();
  private settlingBets: Set<string> = new Set();
  private idempotencyBets: Map<string, AviatorBet> = new Map();
  private history: Array<{ roundNumber: number; crashMultiplier: number; timestamp: string }> = [];
  private listeners: Set<AviatorEventListener> = new Set();
  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private roundCount = 1000;

  private readonly WAITING_DURATION_MS = 5000;
  private readonly CRASHED_DURATION_MS = 4000;
  private readonly TICK_INTERVAL_MS = 100;

  constructor() {
    const seedMultipliers = [2.41, 1.35, 5.82, 1.08, 3.19, 1.76, 12.4, 1.94, 1.15, 4.65];
    this.history = seedMultipliers.map((crashMultiplier, idx) => ({
      roundNumber: this.roundCount - idx,
      crashMultiplier,
      timestamp: new Date(Date.now() - (idx + 1) * 15000).toISOString(),
    }));

    this.currentRound = this.createNextRound();
    this.startWaitingPhase();
  }

  private generateCrashPoint(serverSeed: string, roundNumber: number): number {
    const hmac = hmacSha256Hex(serverSeed, `aviator:${roundNumber}`);
    const intVal = BigInt('0x' + hmac.slice(0, 13));
    const maxVal = 0x10000000000000n;
    // 3% instant crash house edge + heavy-tailed distribution capped at 100x
    if (intVal % 33n === 0n) {
      return 1.0;
    }
    const r = Number(intVal) / Number(maxVal);
    const raw = Math.floor(97 / Math.max(0.0097, 1 - r)) / 100;
    return Math.min(100.0, Math.max(1.01, Number(raw.toFixed(2))));
  }

  private createNextRound(): InternalAviatorRound {
    this.roundCount += 1;
    const serverSeed = randomBytesHex(32);
    const serverSeedHash = sha256Hex(serverSeed);
    const crashMultiplier = this.generateCrashPoint(serverSeed, this.roundCount);

    return {
      id: `round-aviator-${this.roundCount}`,
      roundNumber: this.roundCount,
      status: RoundStatus.WAITING,
      multiplier: 1.0,
      crashMultiplier,
      startedAtMs: null,
      crashedAtMs: null,
      totalBetsCount: 0,
      totalBetAmount: '0',
      tickSequence: 0,
      serverSeed,
      serverSeedHash,
    };
  }

  public subscribe(listener: AviatorEventListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: string, data: any) {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  private clearTimers() {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private startWaitingPhase() {
    this.clearTimers();
    this.currentBets.clear();
    this.settlingBets.clear();
    this.currentRound = this.createNextRound();

    this.emit('aviator:round_state', this.getPublicRoundState());

    this.phaseTimer = setTimeout(() => {
      this.startRunningPhase();
    }, this.WAITING_DURATION_MS);
  }

  private startRunningPhase() {
    this.clearTimers();
    this.currentRound.status = RoundStatus.RUNNING;
    this.currentRound.startedAtMs = Date.now();
    this.currentRound.multiplier = 1.0;
    this.currentRound.tickSequence += 1;

    this.emit('aviator:round_state', this.getPublicRoundState());

    if (this.currentRound.crashMultiplier <= 1.0) {
      void this.crashCurrentRound(1.0);
      return;
    }

    this.tickInterval = setInterval(() => {
      if (this.currentRound.status !== RoundStatus.RUNNING || this.currentRound.startedAtMs === null) {
        return;
      }

      const elapsedSec = Math.max(0, (Date.now() - this.currentRound.startedAtMs) / 1000);
      const computed = Number(Math.exp(0.06 * elapsedSec).toFixed(2));

      if (computed >= this.currentRound.crashMultiplier) {
        void this.crashCurrentRound(this.currentRound.crashMultiplier);
        return;
      }

      this.currentRound.multiplier = Math.max(1.0, computed);
      this.currentRound.tickSequence += 1;

      for (const bet of this.currentBets.values()) {
        if (
          bet.status === BetStatus.PENDING &&
          !this.settlingBets.has(bet.id) &&
          bet.autoCashoutMultiplier != null &&
          this.currentRound.multiplier >= bet.autoCashoutMultiplier
        ) {
          void this.settleWinningBet(bet, bet.autoCashoutMultiplier).catch(() => {});
        }
      }

      this.emit('aviator:round_state', this.getPublicRoundState());
    }, this.TICK_INTERVAL_MS);
  }

  private async crashCurrentRound(finalMultiplier: number) {
    this.clearTimers();
    this.currentRound.status = RoundStatus.CRASHED;
    this.currentRound.multiplier = finalMultiplier;
    this.currentRound.crashedAtMs = Date.now();
    this.currentRound.tickSequence += 1;

    for (const bet of this.currentBets.values()) {
      if (bet.status === BetStatus.PENDING && !this.settlingBets.has(bet.id)) {
        bet.status = BetStatus.LOST;
        bet.winAmount = '0';
        void walletService
          .executeTransfer({
            sourceWalletId: SYSTEM_WALLETS.BET_ESCROW,
            targetWalletId: SYSTEM_WALLETS.AVIATOR_POOL,
            amount: bet.betAmount,
            type: TransactionType.BET_LOSS_TREASURY,
            idempotencyKey: `AVIATOR_LOSS_${bet.id}`,
            description: `Aviator Round #${this.currentRound.roundNumber} Crash Loss`,
            metadata: { roundId: this.currentRound.id, betId: bet.id, crashMultiplier: finalMultiplier },
          })
          .catch((err) => {
            console.error('Aviator loss settlement transfer failed:', err);
          });
      }
    }

    this.history.unshift({
      roundNumber: this.currentRound.roundNumber,
      crashMultiplier: finalMultiplier,
      timestamp: new Date().toISOString(),
    });
    if (this.history.length > 25) {
      this.history.pop();
    }

    this.emit('aviator:round_state', {
      ...this.getPublicRoundState(),
      history: this.getHistory(),
    });

    this.phaseTimer = setTimeout(() => {
      this.startWaitingPhase();
    }, this.CRASHED_DURATION_MS);
  }

  private async settleWinningBet(bet: AviatorBet, cashoutMultiplier: number) {
    if (this.settlingBets.has(bet.id)) {
      return {
        betId: bet.id,
        status: bet.status,
        payoutAmount: bet.winAmount || bet.betAmount,
        cashoutMultiplier: bet.cashedOutMultiplier || cashoutMultiplier,
      };
    }

    this.settlingBets.add(bet.id);
    try {
      const stakeBigInt = BigInt(bet.betAmount);
      const payoutNum = Math.max(Number(stakeBigInt), Math.floor(Number(stakeBigInt) * cashoutMultiplier));
      const payoutBigInt = BigInt(payoutNum);
      const profitBigInt = payoutBigInt - stakeBigInt;

      const playerWallet = await walletService.getWalletByUserId(bet.userId, UserRole.PLAYER);
      if (!playerWallet) {
        throw new Error('Player wallet not found');
      }

      const poolWallet = await walletService.getWallet(SYSTEM_WALLETS.AVIATOR_POOL);
      if (!poolWallet || BigInt(poolWallet.balance) < profitBigInt) {
        throw new Error('Aviator Game Pool liquidity is insufficient for payout');
      }

      await walletService.executeTransfer({
        sourceWalletId: SYSTEM_WALLETS.BET_ESCROW,
        targetWalletId: playerWallet.id,
        amount: stakeBigInt.toString(),
        type: TransactionType.BET_ESCROW_REFUND,
        idempotencyKey: `AVIATOR_REFUND_${bet.id}`,
        description: `Aviator Round #${this.currentRound.roundNumber} Cashout Stake Return (${cashoutMultiplier.toFixed(2)}x)`,
        metadata: { roundId: this.currentRound.id, betId: bet.id, cashoutMultiplier },
      });

      if (profitBigInt > 0n) {
        await walletService.executeTransfer({
          sourceWalletId: SYSTEM_WALLETS.AVIATOR_POOL,
          targetWalletId: playerWallet.id,
          amount: profitBigInt.toString(),
          type: TransactionType.BET_WIN_PAYOUT,
          idempotencyKey: `AVIATOR_WIN_${bet.id}`,
          description: `Aviator Round #${this.currentRound.roundNumber} Cashout Profit (${cashoutMultiplier.toFixed(2)}x)`,
          metadata: { roundId: this.currentRound.id, betId: bet.id, cashoutMultiplier },
        });
      }

      bet.status = BetStatus.WON;
      bet.cashedOutMultiplier = cashoutMultiplier;
      bet.winAmount = payoutBigInt.toString();

      this.emit('aviator:bet_cashed_out', {
        roundId: this.currentRound.id,
        bet,
      });

      return {
        betId: bet.id,
        status: BetStatus.WON,
        payoutAmount: bet.winAmount,
        cashoutMultiplier,
      };
    } finally {
      this.settlingBets.delete(bet.id);
    }
  }

  public async placeBet(params: {
    userId: string;
    username: string;
    userRole: UserRole;
    amount: string;
    autoCashoutMultiplier?: number | null;
    idempotencyKey?: string;
  }): Promise<{ bet: AviatorBet }> {
    if (params.userRole !== UserRole.PLAYER) {
      throw new Error('Only Player accounts can place bets on casino games');
    }

    if (params.idempotencyKey && this.idempotencyBets.has(params.idempotencyKey)) {
      return { bet: this.idempotencyBets.get(params.idempotencyKey)! };
    }

    if (this.currentRound.status !== RoundStatus.WAITING) {
      throw new Error('Betting is closed while flight is in progress. Wait for the next round.');
    }

    if (!/^\d+$/.test(String(params.amount))) {
      throw new Error('Bet amount must be a positive integer');
    }

    const amt = BigInt(params.amount);
    if (amt < 10n || amt > 100000n) {
      throw new Error('Bet amount must be between 10 and 100,000 tokens');
    }

    const poolWallet = await walletService.getWallet(SYSTEM_WALLETS.AVIATOR_POOL);
    if (!poolWallet || BigInt(poolWallet.balance) < amt) {
      throw new Error('Aviator Game Pool liquidity is currently low. Please contact Admin.');
    }

    const playerWallet = await walletService.getWalletByUserId(params.userId, UserRole.PLAYER);
    if (!playerWallet) {
      throw new Error('Player wallet not found');
    }
    if (BigInt(playerWallet.balance) < amt) {
      throw new Error(`Insufficient balance: available ${playerWallet.balance}, required ${amt.toString()}`);
    }

    const betId = randomId('aviator-bet');
    const txKey = params.idempotencyKey ? `AVIATOR_LOCK_${params.idempotencyKey}` : `AVIATOR_LOCK_${betId}`;

    await walletService.executeTransfer({
      sourceWalletId: playerWallet.id,
      targetWalletId: SYSTEM_WALLETS.BET_ESCROW,
      amount: amt.toString(),
      type: TransactionType.BET_ESCROW_LOCK,
      idempotencyKey: txKey,
      description: `Aviator Round #${this.currentRound.roundNumber} Stake Escrowed`,
      metadata: { roundId: this.currentRound.id, betId },
    });

    const bet: AviatorBet = {
      id: betId,
      roundId: this.currentRound.id,
      userId: params.userId,
      username: params.username,
      betAmount: amt.toString(),
      autoCashoutMultiplier: params.autoCashoutMultiplier ?? null,
      cashedOutMultiplier: null,
      winAmount: null,
      status: BetStatus.PENDING,
      createdAt: new Date().toISOString(),
    };

    this.currentBets.set(bet.id, bet);
    if (params.idempotencyKey) {
      this.idempotencyBets.set(params.idempotencyKey, bet);
      if (this.idempotencyBets.size > 500) {
        const firstKey = this.idempotencyBets.keys().next().value;
        if (firstKey) this.idempotencyBets.delete(firstKey);
      }
    }

    this.currentRound.totalBetsCount += 1;
    this.currentRound.totalBetAmount = (BigInt(this.currentRound.totalBetAmount) + amt).toString();

    this.emit('aviator:bet_placed', {
      roundId: this.currentRound.id,
      bet,
      totalBetsCount: this.currentRound.totalBetsCount,
      totalBetAmount: this.currentRound.totalBetAmount,
    });

    return { bet };
  }

  public async cashoutBet(params: { betId: string; userId: string }) {
    const bet = this.currentBets.get(params.betId);
    if (!bet) {
      throw new Error('Active bet not found in current round');
    }
    if (bet.userId !== params.userId) {
      throw new Error('Not authorized to cash out this bet');
    }
    if (bet.status === BetStatus.WON) {
      return {
        result: {
          betId: bet.id,
          status: BetStatus.WON,
          payoutAmount: bet.winAmount || bet.betAmount,
          cashoutMultiplier: bet.cashedOutMultiplier || 1.0,
        },
        bet,
      };
    }
    if (this.currentRound.status !== RoundStatus.RUNNING || this.currentRound.startedAtMs === null) {
      throw new Error('Round has already crashed or has not started');
    }
    if (bet.status !== BetStatus.PENDING) {
      throw new Error(`Bet is already ${bet.status}`);
    }

    const elapsedSec = Math.max(0, (Date.now() - this.currentRound.startedAtMs) / 1000);
    const liveMultiplier = Math.max(1.0, Number(Math.exp(0.06 * elapsedSec).toFixed(2)));
    if (liveMultiplier >= this.currentRound.crashMultiplier) {
      void this.crashCurrentRound(this.currentRound.crashMultiplier);
      throw new Error('Plane already crashed before cashout completed');
    }

    const result = await this.settleWinningBet(bet, liveMultiplier);
    return { result, bet };
  }

  public getPublicRoundState() {
    const isTerminal =
      this.currentRound.status === RoundStatus.CRASHED ||
      this.currentRound.status === RoundStatus.SETTLED;

    return {
      id: this.currentRound.id,
      roundNumber: this.currentRound.roundNumber,
      status: this.currentRound.status,
      multiplier: isTerminal ? this.currentRound.crashMultiplier : this.currentRound.multiplier,
      startedAt: this.currentRound.startedAtMs
        ? new Date(this.currentRound.startedAtMs).toISOString()
        : null,
      crashMultiplier: isTerminal ? this.currentRound.crashMultiplier : null,
      totalBetsCount: this.currentRound.totalBetsCount,
      totalBetAmount: this.currentRound.totalBetAmount,
      tickSequence: this.currentRound.tickSequence,
      serverSeedHash: this.currentRound.serverSeedHash,
      serverTime: new Date().toISOString(),
    };
  }

  public getCurrentRoundBets(): AviatorBet[] {
    return Array.from(this.currentBets.values()).reverse();
  }

  public getHistory() {
    return this.history.map((h) => ({
      roundNumber: h.roundNumber,
      crashMultiplier: h.crashMultiplier,
      timestamp: h.timestamp,
    }));
  }
}

export const aviatorEngine = new ApkAviatorEngine();
