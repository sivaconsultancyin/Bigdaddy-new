import {
  TransactionType,
  UserRole,
  RouletteRoundStatus,
  RouletteRound,
  RouletteRoundBet,
} from '../../../../shared/src/types';
import { SYSTEM_WALLETS } from '../../../../shared/src/constants';
import { walletService } from '../../services/supabaseWallet';
import { randomId, secureRandomInt } from '../../utils/rng';

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export const BLACK_NUMBERS = new Set([
  2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
]);

export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export interface RouletteBetInput {
  id?: string;
  type: string;
  numbers: number[];
  amount: string;
}

export interface RouletteWinner {
  username: string;
  userId: string;
  totalBet: string;
  totalPayout: string;
  netProfit: string;
}

export type RouletteEventListener = (event: string, data: any) => void;

export class ApkRouletteEngine {
  private currentRound: RouletteRound;
  private currentBets: Map<string, RouletteRoundBet> = new Map();
  private userBetsMap: Map<string, string[]> = new Map();
  private idempotencyResults: Map<string, any> = new Map();
  private history: Array<{ number: number; color: 'red' | 'black' | 'green'; timestamp: string }> = [];
  private listeners: Set<RouletteEventListener> = new Set();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private simBetTimeouts: ReturnType<typeof setTimeout>[] = [];
  private roundCount = 420;
  private BETTING_DURATION_MS = 14000;
  private SPIN_DURATION_MS = 9500;
  private RESULT_DURATION_MS = 5500;
  private lastSettledWinners: RouletteWinner[] = [];

  constructor() {
    const seedNumbers = [17, 32, 0, 7, 23, 14, 2, 35, 9, 26, 18, 29];
    this.history = seedNumbers.map((n) => ({
      number: n,
      color: this.getNumberColor(n),
      timestamp: new Date().toISOString(),
    }));

    this.currentRound = {
      id: `round-roulette-${this.roundCount}`,
      roundNumber: this.roundCount,
      status: RouletteRoundStatus.BETTING,
      bettingEndsAt: Date.now() + this.BETTING_DURATION_MS,
      spinEndsAt: null,
      winningNumber: null,
      color: null,
      totalBetsCount: 0,
      totalBetAmount: '0',
    };

    this.startBettingPhase();
  }

  public subscribe(listener: RouletteEventListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: string, data: any) {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch {
        // Ignore listener errors
      }
    }
  }

  public getNumberColor(num: number): 'red' | 'black' | 'green' {
    if (num === 0) return 'green';
    return RED_NUMBERS.has(num) ? 'red' : 'black';
  }

  public getHistory() {
    return [...this.history];
  }

  public getMultiplier(type: string): number {
    switch (type) {
      case 'straight':
        return 36;
      case 'split':
        return 18;
      case 'street':
        return 12;
      case 'corner':
        return 9;
      case 'line':
        return 6;
      default:
        return 0;
    }
  }

  private getExpectedNumbersCount(type: string): number | null {
    switch (type) {
      case 'straight':
        return 1;
      case 'split':
        return 2;
      case 'street':
        return 3;
      case 'corner':
        return 4;
      case 'line':
        return 6;
      default:
        return null;
    }
  }

  public checkBetWin(bet: { type: string; numbers: number[] }, winningNumber: number): boolean {
    const { type, numbers } = bet;
    if (winningNumber === 0) {
      if (type === 'straight' && numbers.includes(0)) return true;
      if ((type === 'split' || type === 'street' || type === 'corner') && numbers.includes(0)) return true;
      return false;
    }
    switch (type) {
      case 'straight':
      case 'split':
      case 'street':
      case 'corner':
      case 'line':
        return numbers.includes(winningNumber);
      default:
        return false;
    }
  }

  private startBettingPhase() {
    this.roundCount++;
    this.currentBets.clear();
    this.userBetsMap.clear();
    this.clearSimTimeouts();

    const now = Date.now();
    this.currentRound = {
      id: `round-roulette-${this.roundCount}`,
      roundNumber: this.roundCount,
      status: RouletteRoundStatus.BETTING,
      bettingEndsAt: now + this.BETTING_DURATION_MS,
      spinEndsAt: null,
      winningNumber: null,
      color: null,
      totalBetsCount: 0,
      totalBetAmount: '0',
    };

    this.emit('roulette:round_betting', {
      round: this.getPublicRoundState(),
      history: this.history.slice(0, 15),
    });

    this.scheduleSimulatedBets();

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.startSpinningPhase();
    }, this.BETTING_DURATION_MS);
  }

  private clearSimTimeouts() {
    for (const t of this.simBetTimeouts) {
      clearTimeout(t);
    }
    this.simBetTimeouts = [];
  }

  private scheduleSimulatedBets() {
    const simPlayers = [
      { name: 'arjun_pro', bets: [{ type: 'straight', numbers: [7], amount: '100' }] },
      { name: 'lucky_strike', bets: [{ type: 'straight', numbers: [17], amount: '50' }, { type: 'straight', numbers: [23], amount: '20' }] },
      { name: 'vegas_king', bets: [{ type: 'straight', numbers: [0], amount: '250' }] },
      { name: 'priya_99', bets: [{ type: 'straight', numbers: [32], amount: '50' }] },
      { name: 'rahul_ace', bets: [{ type: 'straight', numbers: [14], amount: '150' }, { type: 'straight', numbers: [29], amount: '50' }] },
    ];

    const delays = [2500, 5500, 8500, 11000];
    delays.forEach((delay, idx) => {
      const timeout = setTimeout(() => {
        if (this.currentRound.status !== RouletteRoundStatus.BETTING) return;
        const player = simPlayers[idx % simPlayers.length];
        for (const b of player.bets) {
          const betId = randomId(`sim-bet-${player.name}`);
          const roundBet: RouletteRoundBet = {
            id: betId,
            roundId: this.currentRound.id,
            userId: `sim-${player.name}`,
            username: player.name,
            type: b.type,
            numbers: b.numbers,
            amount: b.amount,
            createdAt: new Date().toISOString(),
          };
          this.currentBets.set(betId, roundBet);
          const currentTotal = BigInt(this.currentRound.totalBetAmount) + BigInt(b.amount);
          this.currentRound.totalBetAmount = currentTotal.toString();
          this.currentRound.totalBetsCount = this.currentBets.size;

          this.emit('roulette:bet_placed', {
            roundId: this.currentRound.id,
            bet: {
              id: betId,
              username: player.name,
              type: b.type,
              numbers: b.numbers,
              amount: b.amount,
            },
            totalBetsCount: this.currentBets.size,
            totalBetAmount: this.currentRound.totalBetAmount,
          });
        }
      }, delay);
      this.simBetTimeouts.push(timeout);
    });
  }

  private startSpinningPhase() {
    this.clearSimTimeouts();

    const winningNumber = secureRandomInt(0, 37);
    const color = this.getNumberColor(winningNumber);
    const now = Date.now();

    this.currentRound.status = RouletteRoundStatus.SPINNING;
    this.currentRound.winningNumber = winningNumber;
    this.currentRound.color = color;
    this.currentRound.spinEndsAt = now + this.SPIN_DURATION_MS;

    this.emit('roulette:round_spinning', {
      round: this.getPublicRoundState(),
      winningNumber,
      color,
      spinDurationMs: this.SPIN_DURATION_MS,
      spinEndsAt: this.currentRound.spinEndsAt,
      totalBetsCount: this.currentRound.totalBetsCount,
      totalBetAmount: this.currentRound.totalBetAmount,
    });

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.handleResultPhase();
    }, this.SPIN_DURATION_MS);
  }

  private async handleResultPhase() {
    this.currentRound.status = RouletteRoundStatus.RESULT;
    const winningNumber = this.currentRound.winningNumber ?? 0;
    const color = this.currentRound.color ?? this.getNumberColor(winningNumber);

    const userBetsGroup = new Map<string, RouletteRoundBet[]>();
    for (const bet of this.currentBets.values()) {
      const list = userBetsGroup.get(bet.userId) || [];
      list.push(bet);
      userBetsGroup.set(bet.userId, list);
    }

    const winnersSummary: RouletteWinner[] = [];

    for (const [userId, bets] of userBetsGroup.entries()) {
      const isSimulated = userId.startsWith('sim-');
      const playerWallet = isSimulated ? null : await walletService.getWalletByUserId(userId, UserRole.PLAYER);
      const username = bets[0]?.username || 'Player';

      let totalBetBigInt = 0n;
      let totalPayoutBigInt = 0n;
      let winningEscrowRefundBigInt = 0n;
      let winningPoolNetWinBigInt = 0n;
      let losingEscrowBigInt = 0n;

      for (const bet of bets) {
        const stakeBigInt = BigInt(bet.amount);
        totalBetBigInt += stakeBigInt;
        const won = this.checkBetWin(bet, winningNumber);
        const mult = this.getMultiplier(bet.type);

        if (won && mult > 0) {
          const payoutBigInt = stakeBigInt * BigInt(mult);
          const profitBigInt = payoutBigInt - stakeBigInt;

          totalPayoutBigInt += payoutBigInt;
          winningEscrowRefundBigInt += stakeBigInt;
          winningPoolNetWinBigInt += profitBigInt;

          bet.won = true;
          bet.payout = payoutBigInt.toString();
          bet.profit = profitBigInt.toString();
        } else {
          losingEscrowBigInt += stakeBigInt;
          bet.won = false;
          bet.payout = '0';
          bet.profit = `-${bet.amount}`;
        }
      }

      if (!isSimulated && playerWallet) {
        const spinId = `${this.currentRound.id}-${userId}`;

        if (winningEscrowRefundBigInt > 0n) {
          try {
            await walletService.executeTransfer({
              sourceWalletId: SYSTEM_WALLETS.BET_ESCROW,
              targetWalletId: playerWallet.id,
              amount: winningEscrowRefundBigInt.toString(),
              type: TransactionType.BET_ESCROW_REFUND,
              idempotencyKey: `ROULETTE_REFUND_${spinId}`,
              description: `Roulette Round #${this.currentRound.roundNumber} Winning Stakes Refund`,
              metadata: { roundId: this.currentRound.id, winningNumber },
            });
          } catch (err) {
            console.error('Roulette stake refund transfer failed:', err);
          }
        }

        if (winningPoolNetWinBigInt > 0n) {
          try {
            await walletService.executeTransfer({
              sourceWalletId: SYSTEM_WALLETS.ROULETTE_POOL,
              targetWalletId: playerWallet.id,
              amount: winningPoolNetWinBigInt.toString(),
              type: TransactionType.BET_WIN_PAYOUT,
              idempotencyKey: `ROULETTE_WIN_${spinId}`,
              description: `Roulette Round #${this.currentRound.roundNumber} Payout (Number ${winningNumber})`,
              metadata: { roundId: this.currentRound.id, winningNumber },
            });
          } catch (err) {
            console.error('Roulette win payout transfer failed:', err);
          }
        }

        if (losingEscrowBigInt > 0n) {
          try {
            await walletService.executeTransfer({
              sourceWalletId: SYSTEM_WALLETS.BET_ESCROW,
              targetWalletId: SYSTEM_WALLETS.ROULETTE_POOL,
              amount: losingEscrowBigInt.toString(),
              type: TransactionType.BET_LOSS_TREASURY,
              idempotencyKey: `ROULETTE_LOSS_${spinId}`,
              description: `Roulette Round #${this.currentRound.roundNumber} Loss to Roulette Pool`,
              metadata: { roundId: this.currentRound.id, winningNumber },
            });
          } catch (err) {
            console.error('Roulette loss transfer failed:', err);
          }
        }
      }

      if (totalPayoutBigInt > 0n) {
        winnersSummary.push({
          username,
          userId,
          totalBet: totalBetBigInt.toString(),
          totalPayout: totalPayoutBigInt.toString(),
          netProfit: (totalPayoutBigInt - totalBetBigInt).toString(),
        });
      }
    }

    this.history.unshift({
      number: winningNumber,
      color,
      timestamp: new Date().toISOString(),
    });
    if (this.history.length > 30) {
      this.history.pop();
    }

    this.lastSettledWinners = winnersSummary;
    const poolBalance = await walletService.getPoolBalance(SYSTEM_WALLETS.ROULETTE_POOL);

    this.emit('roulette:round_result', {
      round: this.getPublicRoundState(),
      winningNumber,
      color,
      winners: winnersSummary,
      history: this.history.slice(0, 15),
      poolBalance,
    });

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.startBettingPhase();
    }, this.RESULT_DURATION_MS);
  }

  public async placeBet(params: {
    userId: string;
    username: string;
    userRole: UserRole;
    bets: RouletteBetInput[];
    idempotencyKey?: string;
  }) {
    if (params.userRole !== UserRole.PLAYER) {
      throw new Error('Only Player accounts can place bets on casino games');
    }

    if (params.idempotencyKey && this.idempotencyResults.has(params.idempotencyKey)) {
      return this.idempotencyResults.get(params.idempotencyKey);
    }

    if (this.currentRound.status !== RouletteRoundStatus.BETTING) {
      const remainingSec = this.currentRound.spinEndsAt
        ? Math.max(1, Math.ceil((this.currentRound.spinEndsAt - Date.now()) / 1000))
        : 5;
      throw new Error(`Round in progress (Wheel is spinning). Next betting round starts in ${remainingSec}s!`);
    }

    if (!params.bets || params.bets.length === 0) {
      throw new Error('At least one bet is required');
    }

    let totalBetBigInt = 0n;
    const normalizedBets: RouletteBetInput[] = [];
    for (const bet of params.bets) {
      if (this.getMultiplier(bet.type) <= 0) {
        throw new Error(`Unsupported roulette bet type: ${bet.type}`);
      }
      if (!/^\d+$/.test(String(bet.amount))) {
        throw new Error('Bet amount must be a positive integer');
      }
      const amt = BigInt(bet.amount);
      if (amt <= 0n) {
        throw new Error('Each bet amount must be greater than zero');
      }

      const expectedCount = this.getExpectedNumbersCount(bet.type);
      let validatedNumbers: number[] = [];
      if (expectedCount !== null) {
        const rawNums = Array.isArray(bet.numbers) ? bet.numbers : [];
        const uniqueNums = Array.from(new Set(rawNums));
        if (
          rawNums.length !== expectedCount ||
          uniqueNums.length !== expectedCount ||
          uniqueNums.some((n) => !Number.isInteger(n) || n < 0 || n > 36) ||
          (bet.type === 'line' && uniqueNums.includes(0))
        ) {
          throw new Error(`Invalid numbers selection for ${bet.type} bet`);
        }
        validatedNumbers = uniqueNums;
      }

      normalizedBets.push({
        id: bet.id,
        type: bet.type,
        numbers: validatedNumbers,
        amount: String(bet.amount),
      });
      totalBetBigInt += amt;
    }

    const minBet = 10n;
    const maxBet = 250000n;
    if (totalBetBigInt < minBet) {
      throw new Error(`Minimum total bet is ${minBet} tokens`);
    }
    const existingUserIds = this.userBetsMap.get(params.userId) || [];
    const existingUserTotal = existingUserIds.reduce((sum, id) => {
      const existing = this.currentBets.get(id);
      return existing ? sum + BigInt(existing.amount) : sum;
    }, 0n);
    if (existingUserTotal + totalBetBigInt > maxBet) {
      throw new Error(`Maximum total bet per round is ${maxBet} tokens`);
    }

    const poolWallet = await walletService.getWallet(SYSTEM_WALLETS.ROULETTE_POOL);
    if (!poolWallet) {
      throw new Error('European Roulette Game Pool is unavailable');
    }
    const poolBalanceBigInt = BigInt(poolWallet.balance);
    const existingRealBets = Array.from(this.currentBets.values()).filter((b) => !b.userId.startsWith('sim-'));
    let maxNetLiability = 0n;
    for (let n = 0; n <= 36; n++) {
      let outcomeNetProfit = 0n;
      for (const b of existingRealBets) {
        if (this.checkBetWin(b, n)) {
          outcomeNetProfit += BigInt(b.amount) * BigInt(this.getMultiplier(b.type) - 1);
        }
      }
      for (const b of normalizedBets) {
        if (this.checkBetWin(b, n)) {
          outcomeNetProfit += BigInt(b.amount) * BigInt(this.getMultiplier(b.type) - 1);
        }
      }
      if (outcomeNetProfit > maxNetLiability) {
        maxNetLiability = outcomeNetProfit;
      }
    }
    if (poolBalanceBigInt < maxNetLiability) {
      throw new Error('Roulette Game Pool liquidity is currently low. Please contact Admin.');
    }

    const playerWallet = await walletService.getWalletByUserId(params.userId, UserRole.PLAYER);
    if (!playerWallet) {
      throw new Error('Player wallet not found');
    }
    const playerBalance = BigInt(playerWallet.balance);
    if (playerBalance < totalBetBigInt) {
      throw new Error(`Insufficient balance: available ${playerBalance}, required ${totalBetBigInt}`);
    }

    const lockId = `${this.currentRound.id}-${params.userId}-${Date.now()}`;
    await walletService.executeTransfer({
      sourceWalletId: playerWallet.id,
      targetWalletId: SYSTEM_WALLETS.BET_ESCROW,
      amount: totalBetBigInt.toString(),
      type: TransactionType.BET_ESCROW_LOCK,
      idempotencyKey: params.idempotencyKey ? `ROULETTE_LOCK_${params.idempotencyKey}` : `ROULETTE_LOCK_${lockId}`,
      description: `European Roulette Round #${this.currentRound.roundNumber} Stake Escrowed`,
      metadata: { roundId: this.currentRound.id, betCount: normalizedBets.length },
    });

    const userBetIds: string[] = this.userBetsMap.get(params.userId) || [];
    const addedBets: RouletteRoundBet[] = [];

    for (const b of normalizedBets) {
      const betId = b.id || randomId(`bet-${params.userId}`);
      const roundBet: RouletteRoundBet = {
        id: betId,
        roundId: this.currentRound.id,
        userId: params.userId,
        username: params.username,
        type: b.type,
        numbers: b.numbers,
        amount: b.amount,
        createdAt: new Date().toISOString(),
      };
      this.currentBets.set(betId, roundBet);
      userBetIds.push(betId);
      addedBets.push(roundBet);
    }
    this.userBetsMap.set(params.userId, userBetIds);

    this.currentRound.totalBetAmount = (BigInt(this.currentRound.totalBetAmount) + totalBetBigInt).toString();
    this.currentRound.totalBetsCount = this.currentBets.size;

    this.emit('roulette:bet_placed', {
      roundId: this.currentRound.id,
      username: params.username,
      totalAmount: totalBetBigInt.toString(),
      betCount: params.bets.length,
      totalBetsCount: this.currentBets.size,
      totalBetAmount: this.currentRound.totalBetAmount,
    });

    const updatedWallet = await walletService.getWalletByUserId(params.userId, UserRole.PLAYER);

    const response = {
      success: true,
      roundId: this.currentRound.id,
      roundNumber: this.currentRound.roundNumber,
      betCount: addedBets.length,
      totalBet: totalBetBigInt.toString(),
      remainingBalance: updatedWallet ? updatedWallet.balance : (playerBalance - totalBetBigInt).toString(),
      bets: addedBets,
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

  public getPublicRoundState() {
    return {
      id: this.currentRound.id,
      roundNumber: this.currentRound.roundNumber,
      status: this.currentRound.status,
      bettingEndsAt: this.currentRound.bettingEndsAt,
      spinEndsAt: this.currentRound.spinEndsAt,
      winningNumber:
        this.currentRound.status === RouletteRoundStatus.BETTING
          ? null
          : this.currentRound.winningNumber,
      color:
        this.currentRound.status === RouletteRoundStatus.BETTING
          ? null
          : this.currentRound.color,
      totalBetsCount: this.currentRound.totalBetsCount,
      totalBetAmount: this.currentRound.totalBetAmount,
      recentWinners: this.lastSettledWinners.slice(0, 5),
    };
  }

  public getCurrentRoundBets(userId?: string) {
    if (!userId) {
      return Array.from(this.currentBets.values())
        .slice(-20)
        .map((b) => ({
          id: b.id,
          username: b.username,
          type: b.type,
          numbers: b.numbers,
          amount: b.amount,
        }));
    }

    const betIds = this.userBetsMap.get(userId) || [];
    return betIds.map((id) => this.currentBets.get(id)).filter(Boolean) as RouletteRoundBet[];
  }
}

export const rouletteEngine = new ApkRouletteEngine();
