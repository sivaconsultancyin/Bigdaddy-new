import crypto from 'crypto';
import {
  TransactionType,
  UserRole,
  DiceRoundStatus,
  DiceRound,
  DiceRoundBet,
  DiceHistoryItem,
} from '../../../../shared/src/types';
import { SYSTEM_WALLETS } from '../../../../shared/src/constants';
import { db } from '../../db/storage';

export interface DiceBetInput {
  type: string; // '1'..'10' | 'small' | 'big' | 'even' | 'odd'
  amount: string;
}

export type DiceEventListener = (event: string, data: any) => void;

export class DiceEngine {
  private currentRound: DiceRound;
  private currentBets: Map<string, DiceRoundBet> = new Map();
  private userBetsMap: Map<string, string[]> = new Map();
  private idempotencyResults: Map<string, any> = new Map();
  private history: DiceHistoryItem[] = [];
  private listeners: Set<DiceEventListener> = new Set();
  private timer: NodeJS.Timeout | null = null;
  private roundCount = 601;

  private BETTING_DURATION_MS = 14000; // 14 seconds betting phase
  private ROLLING_DURATION_MS = 4500;  // 4.5 seconds rolling phase
  private RESULT_DURATION_MS = 5000;   // 5.0 seconds celebration & settlement

  private serverSeed: string = '';
  private serverSeedHash: string = '';
  private winningNumber: number | null = null;

  constructor() {
    // Seed initial realistic 1 to 10 history (newest first)
    const seed = [4, 1, 9, 5, 8, 6, 2, 10, 3, 7];
    this.history = seed.map((num, idx) => ({
      roundNumber: this.roundCount - 1 - idx,
      rolledNumber: num,
      timestamp: new Date(Date.now() - (idx + 1) * 30000).toISOString(),
    }));

    this.currentRound = {
      id: `round-dice-${this.roundCount}`,
      roundNumber: this.roundCount,
      status: DiceRoundStatus.BETTING,
      bettingEndsAt: Date.now() + this.BETTING_DURATION_MS,
      rolledNumber: null,
      totalBetsCount: 0,
      totalBetAmount: '0',
      numberBetsAmount: {},
    };

    // Start continuous multiplayer round loop
    this.startBettingPhase();
  }

  public subscribe(listener: DiceEventListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: string, data: any) {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch (e) {
        // Ignore listener error
      }
    }
  }

  public getPublicRoundState(): DiceRound {
    return {
      ...this.currentRound,
      rolledNumber: this.currentRound.status === DiceRoundStatus.RESULT ? this.currentRound.rolledNumber : null,
    };
  }

  public getCurrentRoundBets(): DiceRoundBet[] {
    return Array.from(this.currentBets.values());
  }

  public getHistory(): DiceHistoryItem[] {
    return [...this.history];
  }

  public getServerSeedHash(): string {
    return this.serverSeedHash;
  }

  // --- 1. BETTING PHASE ---
  private startBettingPhase() {
    if (this.timer) clearTimeout(this.timer);

    this.roundCount++;
    this.currentBets.clear();
    this.userBetsMap.clear();

    // Generate fresh provably fair cryptographic seed for this round
    this.serverSeed = crypto.randomBytes(32).toString('hex');
    this.serverSeedHash = crypto.createHash('sha256').update(this.serverSeed).digest('hex');
    this.winningNumber = null;

    this.currentRound = {
      id: `round-dice-${this.roundCount}`,
      roundNumber: this.roundCount,
      status: DiceRoundStatus.BETTING,
      bettingEndsAt: Date.now() + this.BETTING_DURATION_MS,
      rolledNumber: null,
      totalBetsCount: 0,
      totalBetAmount: '0',
      numberBetsAmount: {},
    };

    this.emit('dice:round_betting', {
      round: this.getPublicRoundState(),
      history: this.getHistory(),
      serverSeedHash: this.serverSeedHash,
    });

    // Transition to ROLLING phase after timer expires
    this.timer = setTimeout(() => {
      this.startRollingPhase();
    }, this.BETTING_DURATION_MS);
  }

  // --- 2. ROLLING PHASE ---
  private startRollingPhase() {
    if (this.timer) clearTimeout(this.timer);

    this.currentRound.status = DiceRoundStatus.ROLLING;
    this.currentRound.rolledNumber = null;
    this.winningNumber = null;

    this.emit('dice:round_rolling', {
      round: this.getPublicRoundState(),
    });

    // Pause for 3D dice tumbling and number cycle animation
    this.timer = setTimeout(() => {
      this.startResultPhase();
    }, this.ROLLING_DURATION_MS);
  }

  // --- 3. RESULT & SETTLEMENT PHASE ---
  private startResultPhase() {
    if (this.timer) clearTimeout(this.timer);

    // Calculate provably fair winning number (1 to 10) only after betting & rolling finish
    const hash = crypto.createHmac('sha256', this.serverSeed).update('dice').digest('hex');
    this.winningNumber = Number(BigInt('0x' + hash.slice(0, 13)) % 10n) + 1; // 1 to 10

    this.currentRound.status = DiceRoundStatus.RESULT;
    this.currentRound.rolledNumber = this.winningNumber;

    const rolled = this.winningNumber;
    const winners: any[] = [];
    const poolWallet = db.getWallet(SYSTEM_WALLETS.DICE_POOL);

    for (const bet of this.currentBets.values()) {
      let won = false;
      let multiplier = 0;

      // 1. Exact Number 1 to 10 (9x Payout)
      const numVal = parseInt(bet.type, 10);
      if (!isNaN(numVal) && numVal >= 1 && numVal <= 10) {
        if (numVal === rolled) {
          won = true;
          multiplier = 9.0;
        }
      }
      // 2. Small 1 to 5 (2x Payout)
      else if (bet.type === 'small' && rolled <= 5) {
        won = true;
        multiplier = 2.0;
      }
      // 3. Big 6 to 10 (2x Payout)
      else if (bet.type === 'big' && rolled >= 6) {
        won = true;
        multiplier = 2.0;
      }
      // 4. Even (2, 4, 6, 8, 10) (2x Payout)
      else if (bet.type === 'even' && rolled % 2 === 0) {
        won = true;
        multiplier = 2.0;
      }
      // 5. Odd (1, 3, 5, 7, 9) (2x Payout)
      else if (bet.type === 'odd' && rolled % 2 !== 0) {
        won = true;
        multiplier = 2.0;
      }

      bet.won = won;

      if (won) {
        const betAmtNum = parseInt(bet.amount, 10);
        const payoutNum = Math.floor(betAmtNum * multiplier);
        const profitNum = payoutNum - betAmtNum;
        bet.payout = payoutNum.toString();
        bet.profit = profitNum.toString();

        winners.push({
          username: bet.username,
          userId: bet.userId,
          type: bet.type,
          amount: bet.amount,
          payout: bet.payout,
        });

        // Atomic payout from DICE_POOL to real player wallet
        if (!bet.userId.startsWith('sim-')) {
          const userWallet = db.getWalletByUserId(bet.userId);
          if (userWallet && poolWallet) {
            try {
              db.executeTransfer({
                sourceWalletId: SYSTEM_WALLETS.DICE_POOL,
                targetWalletId: userWallet.id,
                amount: payoutNum.toString(),
                type: TransactionType.BET_WIN_PAYOUT,
                idempotencyKey: `dice-live-win-${bet.id}`,
                description: `Lucky 10 Dice Win - Rolled #${rolled} on ${bet.type.toUpperCase()}`,
                metadata: { roundNumber: this.currentRound.roundNumber, rolledNumber: rolled, multiplier },
              });
            } catch (err: any) {
              console.error('Dice win transfer error:', err);
            }
          }
        }
      } else {
        bet.payout = '0';
        bet.profit = `-${bet.amount}`;
      }
    }

    // Add to history
    this.history.unshift({
      roundNumber: this.currentRound.roundNumber,
      rolledNumber: rolled,
      timestamp: new Date().toISOString(),
    });
    if (this.history.length > 25) this.history.pop();

    const updatedPoolWallet = db.getWallet(SYSTEM_WALLETS.DICE_POOL);

    this.emit('dice:round_result', {
      round: this.getPublicRoundState(),
      rolledNumber: rolled,
      winners,
      history: this.getHistory(),
      serverSeed: this.serverSeed,
      poolBalance: updatedPoolWallet ? updatedPoolWallet.balance : '0',
    });

    // Schedule transition to next round
    this.timer = setTimeout(() => {
      this.startBettingPhase();
    }, this.RESULT_DURATION_MS);
  }

  private getDiceMultiplier(type: string, rolled: number): number {
    const numVal = parseInt(type, 10);
    if (!isNaN(numVal) && String(numVal) === type && numVal >= 1 && numVal <= 10) {
      return numVal === rolled ? 9 : 0;
    }
    if (type === 'small' && rolled <= 5) return 2;
    if (type === 'big' && rolled >= 6) return 2;
    if (type === 'even' && rolled % 2 === 0) return 2;
    if (type === 'odd' && rolled % 2 !== 0) return 2;
    return 0;
  }

  private isValidDiceMarket(type: string): boolean {
    if (['small', 'big', 'even', 'odd'].includes(type)) return true;
    if (/^(10|[1-9])$/.test(type)) return true;
    return false;
  }

  // --- 4. PLAYER BET PLACEMENT ---
  public placeBet(params: {
    userId: string;
    username: string;
    userRole: UserRole;
    bets: DiceBetInput[];
    idempotencyKey?: string;
  }) {
    if (params.userRole !== UserRole.PLAYER) {
      throw new Error('Only Player accounts can place bets on casino games');
    }

    if (params.idempotencyKey && this.idempotencyResults.has(params.idempotencyKey)) {
      return this.idempotencyResults.get(params.idempotencyKey);
    }

    if (this.currentRound.status !== DiceRoundStatus.BETTING) {
      throw new Error('Betting is closed for this round. Please wait for the next round.');
    }

    const userWallet = db.getWalletByUserId(params.userId);
    if (!userWallet) throw new Error('User wallet not found');

    if (!Array.isArray(params.bets) || params.bets.length < 1 || params.bets.length > 20) {
      throw new Error('Please provide between 1 and 20 valid bets');
    }

    let totalRequested = 0n;
    for (const b of params.bets) {
      const market = String(b.type || '').trim().toLowerCase();
      if (!this.isValidDiceMarket(market)) {
        throw new Error(`Unsupported Dice bet market: ${b.type}`);
      }
      if (!/^\d+$/.test(String(b.amount))) {
        throw new Error('Bet amount must be a positive integer');
      }
      const amt = BigInt(b.amount);
      if (amt < 10n || amt > 100000n) {
        throw new Error('Each Dice bet must be between 10 and 100,000 tokens');
      }
      totalRequested += amt;
    }

    const poolWallet = db.getWallet(SYSTEM_WALLETS.DICE_POOL);
    if (!poolWallet) {
      throw new Error('Dice Game Pool is unavailable');
    }

    // Worst-case payout across rolled numbers 1..10 (stakes are transferred into DICE_POOL)
    const existingRealBets = Array.from(this.currentBets.values()).filter((b) => !b.userId.startsWith('sim-'));
    let maxRoundPayout = 0n;
    for (let rolled = 1; rolled <= 10; rolled++) {
      let outcomePayout = 0n;
      for (const b of existingRealBets) {
        const mult = BigInt(this.getDiceMultiplier(b.type, rolled));
        if (mult > 0n) outcomePayout += BigInt(b.amount) * mult;
      }
      for (const b of params.bets) {
        const market = String(b.type).trim().toLowerCase();
        const mult = BigInt(this.getDiceMultiplier(market, rolled));
        if (mult > 0n) outcomePayout += BigInt(b.amount) * mult;
      }
      if (outcomePayout > maxRoundPayout) {
        maxRoundPayout = outcomePayout;
      }
    }

    if (BigInt(poolWallet.balance) + totalRequested < maxRoundPayout) {
      throw new Error('Dice Game Pool liquidity is currently low. Please contact Admin.');
    }

    if (BigInt(userWallet.balance) < totalRequested) {
      throw new Error('Insufficient wallet balance to place bets');
    }

    // Deduct total bet atomically into DICE_POOL
    db.executeTransfer({
      sourceWalletId: userWallet.id,
      targetWalletId: SYSTEM_WALLETS.DICE_POOL,
      amount: totalRequested.toString(),
      type: TransactionType.BET_ESCROW_LOCK,
      idempotencyKey: params.idempotencyKey
        ? `dice-live-bet-${params.idempotencyKey}`
        : `dice-live-bet-${params.userId}-${crypto.randomUUID()}`,
      description: `Lucky 10 Dice Bet - Round #${this.currentRound.roundNumber}`,
      metadata: { roundNumber: this.currentRound.roundNumber, betsCount: params.bets.length },
    });

    const createdBets: DiceRoundBet[] = [];
    for (const b of params.bets) {
      const market = String(b.type || '').trim().toLowerCase();
      const betId = `dice-bet-${crypto.randomUUID()}`;
      const roundBet: DiceRoundBet = {
        id: betId,
        roundId: this.currentRound.id,
        userId: params.userId,
        username: params.username,
        type: market,
        amount: String(b.amount),
        createdAt: new Date().toISOString(),
      };

      this.currentBets.set(betId, roundBet);
      createdBets.push(roundBet);

      this.currentRound.totalBetsCount++;
      this.currentRound.totalBetAmount = (
        BigInt(this.currentRound.totalBetAmount) + BigInt(b.amount)
      ).toString();

      const prevNumAmt = this.currentRound.numberBetsAmount[market] || '0';
      this.currentRound.numberBetsAmount[market] = (
        BigInt(prevNumAmt) + BigInt(b.amount)
      ).toString();

      const existing = this.userBetsMap.get(params.userId) || [];
      existing.push(betId);
      this.userBetsMap.set(params.userId, existing);
    }

    this.emit('dice:bet_placed', {
      roundId: this.currentRound.id,
      bets: createdBets,
      round: this.getPublicRoundState(),
    });

    const response = {
      success: true,
      placedBets: createdBets,
      updatedBalance: db.getWalletByUserId(params.userId)?.balance,
    };

    if (params.idempotencyKey) {
      this.idempotencyResults.set(params.idempotencyKey, response);
      if (this.idempotencyResults.size > 500) {
        const oldest = this.idempotencyResults.keys().next().value;
        if (oldest) this.idempotencyResults.delete(oldest);
      }
    }

    return response;
  }

}

export const diceEngine = new DiceEngine();
