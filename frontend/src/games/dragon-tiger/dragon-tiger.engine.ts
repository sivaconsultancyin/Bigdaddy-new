import {
  TransactionType,
  UserRole,
  DragonTigerRoundStatus,
  DragonTigerRound,
  DragonTigerRoundBet,
  DragonTigerHistoryItem,
} from '../../../../shared/src/types';
import { SYSTEM_WALLETS } from '../../../../shared/src/constants';
import { walletService } from '../../services/supabaseWallet';
import { Card, createDeck, shuffleDeck } from '../../../../shared/src/utils/teenPatti';
import { randomId } from '../../utils/rng';

export interface DragonTigerBetInput {
  type: 'dragon' | 'tiger' | 'tie';
  amount: string;
}

export type DragonTigerEventListener = (event: string, data: any) => void;

export class ApkDragonTigerEngine {
  private currentRound: DragonTigerRound;
  private currentBets: Map<string, DragonTigerRoundBet> = new Map();
  private userBetsMap: Map<string, string[]> = new Map();
  private idempotencyResults: Map<string, any> = new Map();
  private history: DragonTigerHistoryItem[] = [];
  private listeners: Set<DragonTigerEventListener> = new Set();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private roundCount = 0;

  private BETTING_DURATION_MS = 12000;
  private REVEAL_DURATION_MS = 6000;
  private RESULT_DURATION_MS = 5500;

  private dragonCard: Card | null = null;
  private tigerCard: Card | null = null;
  private roundWinner: 'dragon' | 'tiger' | 'tie' | null = null;

  constructor() {
    this.currentRound = {
      id: `round-dt-${this.roundCount}`,
      roundNumber: this.roundCount,
      status: DragonTigerRoundStatus.BETTING,
      bettingEndsAt: Date.now() + this.BETTING_DURATION_MS,
      dragonCard: null,
      tigerCard: null,
      winner: null,
      totalBetsCount: 0,
      totalBetAmount: '0',
      dragonBetAmount: '0',
      tigerBetAmount: '0',
      tieBetAmount: '0',
    };

    this.startBettingPhase();
  }

  public subscribe(listener: DragonTigerEventListener) {
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

  public getPublicRoundState(): DragonTigerRound {
    return { ...this.currentRound };
  }

  public getCurrentRoundBets(): DragonTigerRoundBet[] {
    return Array.from(this.currentBets.values());
  }

  public getUserBets(userId: string) {
    const ids = this.userBetsMap.get(userId) || [];
    return ids
      .map((id) => this.currentBets.get(id))
      .filter((b): b is DragonTigerRoundBet => Boolean(b))
      .map((b) => ({
        id: b.id,
        roundId: b.roundId,
        amount: b.amount,
        type: b.type,
        status: b.won === true ? 'WON' : b.won === false ? 'LOST' : 'PENDING',
        payoutAmount: b.payout || '0',
      }));
  }

  public getHistory(): DragonTigerHistoryItem[] {
    return [...this.history];
  }

  private startBettingPhase() {
    if (this.timer) clearTimeout(this.timer);

    this.roundCount++;
    this.currentBets.clear();
    this.userBetsMap.clear();

    const deck = shuffleDeck(createDeck());
    this.dragonCard = deck[0];
    this.tigerCard = deck[1];

    const dVal = this.dragonCard.rank === 14 ? 1 : this.dragonCard.rank;
    const tVal = this.tigerCard.rank === 14 ? 1 : this.tigerCard.rank;

    if (dVal > tVal) {
      this.roundWinner = 'dragon';
    } else if (tVal > dVal) {
      this.roundWinner = 'tiger';
    } else {
      this.roundWinner = 'tie';
    }

    this.currentRound = {
      id: `round-dt-${this.roundCount}`,
      roundNumber: this.roundCount,
      status: DragonTigerRoundStatus.BETTING,
      bettingEndsAt: Date.now() + this.BETTING_DURATION_MS,
      dragonCard: null,
      tigerCard: null,
      winner: null,
      totalBetsCount: 0,
      totalBetAmount: '0',
      dragonBetAmount: '0',
      tigerBetAmount: '0',
      tieBetAmount: '0',
    };

    this.emit('dragon_tiger:round_betting', {
      round: this.getPublicRoundState(),
      history: this.getHistory(),
    });

    this.timer = setTimeout(() => {
      this.startRevealingPhase();
    }, this.BETTING_DURATION_MS);
  }

  private startRevealingPhase() {
    if (this.timer) clearTimeout(this.timer);

    this.currentRound.status = DragonTigerRoundStatus.REVEALING;
    this.currentRound.dragonCard = this.dragonCard;
    this.currentRound.tigerCard = this.tigerCard;

    this.emit('dragon_tiger:round_revealing', {
      round: this.getPublicRoundState(),
      dragonCard: this.dragonCard,
      tigerCard: this.tigerCard,
    });

    this.timer = setTimeout(() => {
      void this.startResultPhase();
    }, this.REVEAL_DURATION_MS);
  }

  private async startResultPhase() {
    if (this.timer) clearTimeout(this.timer);

    this.currentRound.status = DragonTigerRoundStatus.RESULT;
    this.currentRound.winner = this.roundWinner;

    const winners: any[] = [];
    const poolWallet = await walletService.getWallet(SYSTEM_WALLETS.DRAGON_TIGER_POOL);

    for (const bet of this.currentBets.values()) {
      let won = false;
      let multiplier = 0;

      if (bet.type === 'dragon' && this.roundWinner === 'dragon') {
        won = true;
        multiplier = 2.0;
      } else if (bet.type === 'tiger' && this.roundWinner === 'tiger') {
        won = true;
        multiplier = 2.0;
      } else if (bet.type === 'tie' && this.roundWinner === 'tie') {
        won = true;
        multiplier = 9.0;
      }

      bet.won = won;

      if (won) {
        const betAmountNum = parseInt(bet.amount, 10);
        const payoutNum = Math.floor(betAmountNum * multiplier);
        const profitNum = payoutNum - betAmountNum;
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
                sourceWalletId: SYSTEM_WALLETS.DRAGON_TIGER_POOL,
                targetWalletId: userWallet.id,
                amount: payoutNum.toString(),
                type: TransactionType.BET_WIN_PAYOUT,
                idempotencyKey: `dt-win-${this.currentRound.id}-${bet.id}`,
                description: `Dragon Tiger Win - Round #${this.currentRound.roundNumber} on ${bet.type.toUpperCase()}`,
                metadata: { roundNumber: this.currentRound.roundNumber, betType: bet.type, multiplier },
              });
            } catch (err) {
              console.error('Dragon Tiger win transfer error:', err);
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
      dragonCard: this.dragonCard!,
      tigerCard: this.tigerCard!,
      winner: this.roundWinner!,
      timestamp: new Date().toISOString(),
    });
    if (this.history.length > 20) this.history.pop();

    const poolBalance = await walletService.getPoolBalance(SYSTEM_WALLETS.DRAGON_TIGER_POOL);

    this.emit('dragon_tiger:round_result', {
      round: this.getPublicRoundState(),
      winners,
      history: this.getHistory(),
      poolBalance,
    });

    this.timer = setTimeout(() => {
      this.startBettingPhase();
    }, this.RESULT_DURATION_MS);
  }

  public async placeBet(params: {
    userId: string;
    username: string;
    userRole: UserRole;
    bets: DragonTigerBetInput[];
    idempotencyKey?: string;
  }) {
    if (params.idempotencyKey && this.idempotencyResults.has(params.idempotencyKey)) {
      return this.idempotencyResults.get(params.idempotencyKey);
    }

    if (this.currentRound.status !== DragonTigerRoundStatus.BETTING) {
      throw new Error('Betting is closed for this round. Please wait for the next round.');
    }

    const userWallet = await walletService.getWalletByUserId(params.userId, UserRole.PLAYER);
    if (!userWallet) throw new Error('User wallet not found');

    let totalRequested = 0n;
    if (params.userRole !== UserRole.PLAYER) throw new Error('PLAYER_ROLE_REQUIRED');
    if (!Array.isArray(params.bets) || params.bets.length < 1 || params.bets.length > 20) throw new Error('INVALID_BET_COUNT');
    for (const b of params.bets) {
      if (!['dragon', 'tiger', 'tie'].includes(String(b.type).toLowerCase())) throw new Error('UNSUPPORTED_DRAGON_TIGER_MARKET');
      if (!/^\d+$/.test(b.amount)) throw new Error('INVALID_BET_AMOUNT');
      const amt = BigInt(b.amount);
      if (amt < 10n || amt > 100000n) throw new Error('BET_OUT_OF_RANGE');
      totalRequested += amt;
    }

    const poolWallet = await walletService.getWallet(SYSTEM_WALLETS.DRAGON_TIGER_POOL);
    if (!poolWallet) {
      throw new Error('Dragon Tiger Game Pool is unavailable');
    }

    const existingRealBets = Array.from(this.currentBets.values()).filter((b) => !b.userId.startsWith('sim-'));
    const payoutByOutcome: Record<'dragon' | 'tiger' | 'tie', bigint> = { dragon: 0n, tiger: 0n, tie: 0n };
    for (const b of existingRealBets) {
      const t = String(b.type).toLowerCase() as 'dragon' | 'tiger' | 'tie';
      if (t === 'dragon') payoutByOutcome.dragon += BigInt(b.amount) * 2n;
      else if (t === 'tiger') payoutByOutcome.tiger += BigInt(b.amount) * 2n;
      else if (t === 'tie') payoutByOutcome.tie += BigInt(b.amount) * 9n;
    }
    for (const b of params.bets) {
      const t = String(b.type).toLowerCase() as 'dragon' | 'tiger' | 'tie';
      if (t === 'dragon') payoutByOutcome.dragon += BigInt(b.amount) * 2n;
      else if (t === 'tiger') payoutByOutcome.tiger += BigInt(b.amount) * 2n;
      else if (t === 'tie') payoutByOutcome.tie += BigInt(b.amount) * 9n;
    }
    const maxPayout = [payoutByOutcome.dragon, payoutByOutcome.tiger, payoutByOutcome.tie].reduce(
      (max, v) => (v > max ? v : max),
      0n
    );
    if (BigInt(poolWallet.balance) + totalRequested < maxPayout) {
      throw new Error('Dragon Tiger Game Pool liquidity is currently low. Please contact Admin.');
    }

    if (BigInt(userWallet.balance) < totalRequested) {
      throw new Error('Insufficient wallet balance to place bets');
    }

    await walletService.executeTransfer({
      sourceWalletId: userWallet.id,
      targetWalletId: SYSTEM_WALLETS.DRAGON_TIGER_POOL,
      amount: totalRequested.toString(),
      type: TransactionType.BET_ESCROW_LOCK,
      idempotencyKey: params.idempotencyKey
        ? `dt-bet-${params.idempotencyKey}`
        : `dt-bet-${params.userId}-${randomId('k')}`,
      description: `Dragon Tiger Bet - Round #${this.currentRound.roundNumber}`,
      metadata: { roundNumber: this.currentRound.roundNumber, betsCount: params.bets.length },
    });

    const createdBets: DragonTigerRoundBet[] = [];
    for (const b of params.bets) {
      const betType = String(b.type).toLowerCase() as 'dragon' | 'tiger' | 'tie';
      const betId = randomId('dt-bet');
      const roundBet: DragonTigerRoundBet = {
        id: betId,
        roundId: this.currentRound.id,
        userId: params.userId,
        username: params.username,
        type: betType,
        amount: b.amount,
        createdAt: new Date().toISOString(),
      };

      this.currentBets.set(betId, roundBet);
      createdBets.push(roundBet);

      this.currentRound.totalBetsCount++;
      this.currentRound.totalBetAmount = (
        BigInt(this.currentRound.totalBetAmount) + BigInt(b.amount)
      ).toString();

      if (betType === 'dragon') {
        this.currentRound.dragonBetAmount = (
          BigInt(this.currentRound.dragonBetAmount) + BigInt(b.amount)
        ).toString();
      } else if (betType === 'tiger') {
        this.currentRound.tigerBetAmount = (
          BigInt(this.currentRound.tigerBetAmount) + BigInt(b.amount)
        ).toString();
      } else if (betType === 'tie') {
        this.currentRound.tieBetAmount = (
          BigInt(this.currentRound.tieBetAmount) + BigInt(b.amount)
        ).toString();
      }

      const existing = this.userBetsMap.get(params.userId) || [];
      existing.push(betId);
      this.userBetsMap.set(params.userId, existing);
    }

    this.emit('dragon_tiger:bet_placed', {
      roundId: this.currentRound.id,
      bets: createdBets,
      round: this.getPublicRoundState(),
    });

    const updatedWallet = await walletService.getWalletByUserId(params.userId, UserRole.PLAYER);

    const response = {
      success: true,
      roundId: this.currentRound.id,
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

export const dragonTigerEngine = new ApkDragonTigerEngine();
