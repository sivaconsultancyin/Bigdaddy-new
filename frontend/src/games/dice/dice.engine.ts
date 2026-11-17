import {
  TransactionType,
  UserRole,
  DiceRoundStatus,
  DiceRound,
  DiceRoundBet,
  DiceHistoryItem,
} from '../../../../shared/src/types';
import { SYSTEM_WALLETS } from '../../../../shared/src/constants';
import { walletService } from '../../services/supabaseWallet';
import { hmacSha256Hex, randomBytesHex, randomId, sha256Hex } from '../../utils/rng';

export interface DiceBetInput {
  type: string; // '1'..'10' | 'small' | 'big' | 'even' | 'odd'
  amount: string;
}

export type DiceEventListener = (event: string, data: any) => void;

export class ApkDiceEngine {
  private currentRound: DiceRound;
  private currentBets: Map<string, DiceRoundBet> = new Map();
  private userBetsMap: Map<string, string[]> = new Map();
  private idempotencyResults: Map<string, any> = new Map();
  private history: DiceHistoryItem[] = [];
  private listeners: Set<DiceEventListener> = new Set();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private roundCount = 601;

  private BETTING_DURATION_MS = 14000;
  private ROLLING_DURATION_MS = 4500;
  private RESULT_DURATION_MS = 5000;

  private serverSeed = '';
  private serverSeedHash = '';
  private winningNumber: number | null = null;

  constructor() {
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
      } catch {
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

  public verifyRoll(serverSeed: string): { serverSeedHash: string; calculatedRoll: number } {
    const cleanSeed = String(serverSeed || '').trim();
    if (!cleanSeed) {
      throw new Error('Server seed is required for verification');
    }
    const hash = hmacSha256Hex(cleanSeed, 'dice');
    const calculatedRoll = Number(BigInt('0x' + hash.slice(0, 13)) % 10n) + 1;
    return {
      serverSeedHash: sha256Hex(cleanSeed),
      calculatedRoll,
    };
  }

  private startBettingPhase() {
    if (this.timer) clearTimeout(this.timer);

    this.roundCount++;
    this.currentBets.clear();
    this.userBetsMap.clear();

    this.serverSeed = randomBytesHex(32);
    this.serverSeedHash = sha256Hex(this.serverSeed);
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

    this.timer = setTimeout(() => {
      this.startRollingPhase();
    }, this.BETTING_DURATION_MS);
  }

  private startRollingPhase() {
    if (this.timer) clearTimeout(this.timer);

    this.currentRound.status = DiceRoundStatus.ROLLING;
    this.currentRound.rolledNumber = null;
    this.winningNumber = null;

    this.emit('dice:round_rolling', {
      round: this.getPublicRoundState(),
    });

    this.timer = setTimeout(() => {
      void this.startResultPhase();
    }, this.ROLLING_DURATION_MS);
  }

  private async startResultPhase() {
    if (this.timer) clearTimeout(this.timer);

    const hash = hmacSha256Hex(this.serverSeed, 'dice');
    this.winningNumber = Number(BigInt('0x' + hash.slice(0, 13)) % 10n) + 1;

    this.currentRound.status = DiceRoundStatus.RESULT;
    this.currentRound.rolledNumber = this.winningNumber;

    const rolled = this.winningNumber;
    const winners: any[] = [];
    const poolWallet = await walletService.getWallet(SYSTEM_WALLETS.DICE_POOL);

    for (const bet of this.currentBets.values()) {
      let won = false;
      let multiplier = 0;

      const numVal = parseInt(bet.type, 10);
      if (!isNaN(numVal) && numVal >= 1 && numVal <= 10) {
        if (numVal === rolled) {
          won = true;
          multiplier = 9.0;
        }
      } else if (bet.type === 'small' && rolled <= 5) {
        won = true;
        multiplier = 2.0;
      } else if (bet.type === 'big' && rolled >= 6) {
        won = true;
        multiplier = 2.0;
      } else if (bet.type === 'even' && rolled % 2 === 0) {
        won = true;
        multiplier = 2.0;
      } else if (bet.type === 'odd' && rolled % 2 !== 0) {
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

        if (!bet.userId.startsWith('sim-')) {
          const userWallet = await walletService.getWalletByUserId(bet.userId, UserRole.PLAYER);
          if (userWallet && poolWallet) {
            try {
              await walletService.executeTransfer({
                sourceWalletId: SYSTEM_WALLETS.DICE_POOL,
                targetWalletId: userWallet.id,
                amount: payoutNum.toString(),
                type: TransactionType.BET_WIN_PAYOUT,
                idempotencyKey: `dice-live-win-${bet.id}`,
                description: `Lucky 10 Dice Win - Rolled #${rolled} on ${bet.type.toUpperCase()}`,
                metadata: { roundNumber: this.currentRound.roundNumber, rolledNumber: rolled, multiplier },
              });
            } catch (err) {
              console.error('Dice win transfer error:', err);
            }
          }
        }
      } else {
        bet.payout = '0';
        bet.profit = `-${bet.amount}`;
      }
    }

    this.history.unshift({
      roundNumber: this.currentRound.roundNumber,
      rolledNumber: rolled,
      timestamp: new Date().toISOString(),
    });
    if (this.history.length > 25) this.history.pop();

    const poolBalance = await walletService.getPoolBalance(SYSTEM_WALLETS.DICE_POOL);

    this.emit('dice:round_result', {
      round: this.getPublicRoundState(),
      rolledNumber: rolled,
      winners,
      history: this.getHistory(),
      serverSeed: this.serverSeed,
      poolBalance,
    });

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

  public async placeBet(params: {
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

    const userWallet = await walletService.getWalletByUserId(params.userId, UserRole.PLAYER);
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

    const poolWallet = await walletService.getWallet(SYSTEM_WALLETS.DICE_POOL);
    if (!poolWallet) {
      throw new Error('Dice Game Pool is unavailable');
    }

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

    await walletService.executeTransfer({
      sourceWalletId: userWallet.id,
      targetWalletId: SYSTEM_WALLETS.DICE_POOL,
      amount: totalRequested.toString(),
      type: TransactionType.BET_ESCROW_LOCK,
      idempotencyKey: params.idempotencyKey
        ? `dice-live-bet-${params.idempotencyKey}`
        : `dice-live-bet-${params.userId}-${randomId('k')}`,
      description: `Lucky 10 Dice Bet - Round #${this.currentRound.roundNumber}`,
      metadata: { roundNumber: this.currentRound.roundNumber, betsCount: params.bets.length },
    });

    const createdBets: DiceRoundBet[] = [];
    for (const b of params.bets) {
      const market = String(b.type || '').trim().toLowerCase();
      const betId = randomId('dice-bet');
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

    const updatedWallet = await walletService.getWalletByUserId(params.userId, UserRole.PLAYER);

    const response = {
      success: true,
      placedBets: createdBets,
      updatedBalance: updatedWallet?.balance,
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

export const diceEngine = new ApkDiceEngine();
