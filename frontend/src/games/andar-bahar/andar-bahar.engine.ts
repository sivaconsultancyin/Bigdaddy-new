import {
  TransactionType,
  UserRole,
  AndarBaharRoundStatus,
  AndarBaharRound,
  AndarBaharRoundBet,
  AndarBaharHistoryItem,
} from '../../../../shared/src/types';
import { SYSTEM_WALLETS } from '../../../../shared/src/constants';
import { walletService } from '../../services/supabaseWallet';
import { Card, createDeck, shuffleDeck, SUIT_COLORS } from '../../../../shared/src/utils/teenPatti';
import { randomId, secureRandomInt } from '../../utils/rng';

export interface AndarBaharBetInput {
  type: string;
  amount: string;
}

export type AndarBaharEventListener = (event: string, data: any) => void;

export class ApkAndarBaharEngine {
  private currentRound: AndarBaharRound;
  private currentBets: Map<string, AndarBaharRoundBet> = new Map();
  private userBetsMap: Map<string, string[]> = new Map();
  private idempotencyResults: Map<string, any> = new Map();
  private history: AndarBaharHistoryItem[] = [];
  private listeners: Set<AndarBaharEventListener> = new Set();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dealTimer: ReturnType<typeof setInterval> | null = null;
  private simBetTimeouts: ReturnType<typeof setTimeout>[] = [];
  private roundCount = 301;

  private BETTING_DURATION_MS = 13000;
  private RESULT_DURATION_MS = 6000;
  private DEAL_SPEED_MS = 650;

  private remainingDeck: Card[] = [];
  private fullDealQueue: Array<{ side: 'andar' | 'bahar'; card: Card }> = [];
  private winningCard: Card | null = null;
  private winningSide: 'andar' | 'bahar' | null = null;

  constructor() {
    const seedRanks = [
      { r: 8, s: 'H' as const, win: 'andar' as const, winR: 8, winS: 'S' as const, count: 5 },
      { r: 13, s: 'S' as const, win: 'bahar' as const, winR: 13, winS: 'C' as const, count: 8 },
      { r: 2, s: 'D' as const, win: 'andar' as const, winR: 2, winS: 'H' as const, count: 3 },
      { r: 10, s: 'C' as const, win: 'andar' as const, winR: 10, winS: 'D' as const, count: 11 },
      { r: 14, s: 'H' as const, win: 'bahar' as const, winR: 14, winS: 'S' as const, count: 4 },
      { r: 7, s: 'S' as const, win: 'bahar' as const, winR: 7, winS: 'C' as const, count: 9 },
    ];

    this.history = seedRanks.map((item, idx) => ({
      roundNumber: this.roundCount - seedRanks.length + idx,
      jokerCard: { suit: item.s, rank: item.r },
      winningSide: item.win,
      winningCard: { suit: item.winS, rank: item.winR },
      totalCards: item.count,
      timestamp: new Date(Date.now() - (seedRanks.length - idx) * 35000).toISOString(),
    }));

    this.currentRound = {
      id: `round-ab-${this.roundCount}`,
      roundNumber: this.roundCount,
      status: AndarBaharRoundStatus.BETTING,
      jokerCard: { suit: 'H', rank: 8 },
      bettingEndsAt: Date.now() + this.BETTING_DURATION_MS,
      dealCards: [],
      winningSide: null,
      winningCard: null,
      totalCardsDealt: 0,
      firstSide: 'bahar',
      totalBetsCount: 0,
      totalBetAmount: '0',
      andarBetAmount: '0',
      baharBetAmount: '0',
    };

    this.startBettingPhase();
  }

  public subscribe(listener: AndarBaharEventListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: string, data: any) {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch {
        // Ignore errors
      }
    }
  }

  public getPublicRoundState(): AndarBaharRound {
    return {
      ...this.currentRound,
      dealCards: [...this.currentRound.dealCards],
    };
  }

  public getCurrentRoundBets(): AndarBaharRoundBet[] {
    return Array.from(this.currentBets.values());
  }

  public getUserBets(userId: string): AndarBaharRoundBet[] {
    const ids = this.userBetsMap.get(userId) || [];
    return ids.map((id) => this.currentBets.get(id)).filter((b): b is AndarBaharRoundBet => Boolean(b));
  }

  public getHistory(): AndarBaharHistoryItem[] {
    return [...this.history];
  }

  private startBettingPhase() {
    if (this.timer) clearTimeout(this.timer);
    if (this.dealTimer) clearInterval(this.dealTimer);
    this.simBetTimeouts.forEach((t) => clearTimeout(t));
    this.simBetTimeouts = [];

    this.roundCount++;
    this.currentBets.clear();
    this.userBetsMap.clear();

    const deck = shuffleDeck(createDeck());
    const jokerCard = deck[0];
    this.remainingDeck = deck.slice(1);

    const isBlack = SUIT_COLORS[jokerCard.suit] === 'black';
    const firstSide: 'andar' | 'bahar' = isBlack ? 'andar' : 'bahar';

    this.fullDealQueue = [];
    let currentSide = firstSide;
    let winnerFound = false;

    for (const card of this.remainingDeck) {
      this.fullDealQueue.push({ side: currentSide, card });
      if (card.rank === jokerCard.rank) {
        this.winningSide = currentSide;
        this.winningCard = card;
        winnerFound = true;
        break;
      }
      currentSide = currentSide === 'andar' ? 'bahar' : 'andar';
    }

    if (!winnerFound) {
      this.winningSide = 'andar';
      this.winningCard = { suit: 'S', rank: jokerCard.rank };
      this.fullDealQueue.push({ side: 'andar', card: this.winningCard });
    }

    this.currentRound = {
      id: `round-ab-${this.roundCount}`,
      roundNumber: this.roundCount,
      status: AndarBaharRoundStatus.BETTING,
      jokerCard,
      bettingEndsAt: Date.now() + this.BETTING_DURATION_MS,
      dealCards: [],
      winningSide: null,
      winningCard: null,
      totalCardsDealt: 0,
      firstSide,
      totalBetsCount: 0,
      totalBetAmount: '0',
      andarBetAmount: '0',
      baharBetAmount: '0',
    };

    this.emit('andar_bahar:round_betting', {
      round: this.getPublicRoundState(),
      history: this.getHistory(),
    });

    this.scheduleSimulatedCommunityBets();

    this.timer = setTimeout(() => {
      this.startDealingPhase();
    }, this.BETTING_DURATION_MS);
  }

  private startDealingPhase() {
    if (this.timer) clearTimeout(this.timer);
    this.simBetTimeouts.forEach((t) => clearTimeout(t));

    this.currentRound.status = AndarBaharRoundStatus.DEALING;
    this.currentRound.dealCards = [];

    this.emit('andar_bahar:round_dealing', {
      round: this.getPublicRoundState(),
    });

    let dealIndex = 0;
    const totalToDeal = this.fullDealQueue.length;

    this.dealTimer = setInterval(() => {
      if (dealIndex >= totalToDeal) {
        if (this.dealTimer) clearInterval(this.dealTimer);
        void this.startResultPhase();
        return;
      }

      const nextCardItem = this.fullDealQueue[dealIndex];
      this.currentRound.dealCards.push(nextCardItem);
      this.currentRound.totalCardsDealt = this.currentRound.dealCards.length;

      const isMatch = nextCardItem.card.rank === this.currentRound.jokerCard!.rank;

      this.emit('andar_bahar:card_dealt', {
        roundId: this.currentRound.id,
        item: nextCardItem,
        totalDealt: this.currentRound.totalCardsDealt,
        isMatch,
      });

      if (isMatch) {
        if (this.dealTimer) clearInterval(this.dealTimer);
        this.timer = setTimeout(() => {
          void this.startResultPhase();
        }, 1200);
      }

      dealIndex++;
    }, this.DEAL_SPEED_MS);
  }

  private async startResultPhase() {
    if (this.dealTimer) clearInterval(this.dealTimer);
    if (this.timer) clearTimeout(this.timer);

    this.currentRound.status = AndarBaharRoundStatus.RESULT;
    this.currentRound.winningSide = this.winningSide;
    this.currentRound.winningCard = this.winningCard;

    const winners: any[] = [];
    const poolWallet = await walletService.getWallet(SYSTEM_WALLETS.ANDAR_BAHAR_POOL);

    for (const bet of this.currentBets.values()) {
      let won = false;
      let multiplier = 0;

      if (bet.type === this.winningSide) {
        won = true;
        multiplier = this.winningSide === this.currentRound.firstSide ? 1.9 : 2.0;
      } else if (bet.type === 'joker_red' && SUIT_COLORS[this.currentRound.jokerCard!.suit] === 'red') {
        won = true;
        multiplier = 1.95;
      } else if (bet.type === 'joker_black' && SUIT_COLORS[this.currentRound.jokerCard!.suit] === 'black') {
        won = true;
        multiplier = 1.95;
      } else if (bet.type === 'cards_1_5' && this.currentRound.totalCardsDealt <= 5) {
        won = true;
        multiplier = 3.5;
      } else if (bet.type === 'cards_6_10' && this.currentRound.totalCardsDealt >= 6 && this.currentRound.totalCardsDealt <= 10) {
        won = true;
        multiplier = 4.5;
      } else if (bet.type === 'cards_11_15' && this.currentRound.totalCardsDealt >= 11 && this.currentRound.totalCardsDealt <= 15) {
        won = true;
        multiplier = 5.5;
      } else if (bet.type === 'cards_16_25' && this.currentRound.totalCardsDealt >= 16 && this.currentRound.totalCardsDealt <= 25) {
        won = true;
        multiplier = 4.5;
      } else if (bet.type === 'cards_25_plus' && this.currentRound.totalCardsDealt > 25) {
        won = true;
        multiplier = 25.0;
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
                sourceWalletId: SYSTEM_WALLETS.ANDAR_BAHAR_POOL,
                targetWalletId: userWallet.id,
                amount: payoutNum.toString(),
                type: TransactionType.BET_WIN_PAYOUT,
                idempotencyKey: `ab-win-${this.currentRound.id}-${bet.id}`,
                description: `Andar Bahar Win - Round #${this.currentRound.roundNumber} on ${bet.type.toUpperCase()}`,
                metadata: { roundNumber: this.currentRound.roundNumber, betType: bet.type, multiplier },
              });
            } catch (err) {
              console.error('Andar Bahar win transfer error:', err);
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
      jokerCard: this.currentRound.jokerCard!,
      winningSide: this.winningSide!,
      winningCard: this.winningCard!,
      totalCards: this.currentRound.totalCardsDealt,
      timestamp: new Date().toISOString(),
    });
    if (this.history.length > 20) this.history.pop();

    const poolBalance = await walletService.getPoolBalance(SYSTEM_WALLETS.ANDAR_BAHAR_POOL);

    this.emit('andar_bahar:round_result', {
      round: this.getPublicRoundState(),
      winners,
      history: this.getHistory(),
      poolBalance,
    });

    this.timer = setTimeout(() => {
      this.startBettingPhase();
    }, this.RESULT_DURATION_MS);
  }

  private getMaxMultiplierForMarket(market: string): number {
    switch (market) {
      case 'andar':
      case 'bahar':
      case 'joker_red':
      case 'joker_black':
        return 2;
      case 'cards_1_5':
        return 4;
      case 'cards_6_10':
        return 5;
      case 'cards_11_15':
        return 6;
      case 'cards_16_25':
        return 5;
      case 'cards_25_plus':
        return 25;
      default:
        return 0;
    }
  }

  public async placeBet(params: {
    userId: string;
    username: string;
    userRole: UserRole;
    bets: AndarBaharBetInput[];
    idempotencyKey?: string;
  }) {
    if (params.userRole !== UserRole.PLAYER) {
      throw new Error('Only Player accounts can place bets on casino games');
    }

    if (params.idempotencyKey && this.idempotencyResults.has(params.idempotencyKey)) {
      return this.idempotencyResults.get(params.idempotencyKey);
    }

    if (this.currentRound.status !== AndarBaharRoundStatus.BETTING) {
      throw new Error('Betting is closed for this round. Please wait for the next round.');
    }

    const userWallet = await walletService.getWalletByUserId(params.userId, UserRole.PLAYER);
    if (!userWallet) throw new Error('User wallet not found');

    if (!Array.isArray(params.bets) || params.bets.length < 1 || params.bets.length > 20) {
      throw new Error('Please provide between 1 and 20 valid bets');
    }

    let totalRequested = 0n;
    let incomingMaxPayout = 0n;
    for (const b of params.bets) {
      const market = String(b.type || '').trim().toLowerCase();
      const maxMult = this.getMaxMultiplierForMarket(market);
      if (maxMult <= 0) {
        throw new Error(`Unsupported Andar Bahar bet market: ${b.type}`);
      }
      if (!/^\d+$/.test(String(b.amount))) {
        throw new Error('Bet amount must be a positive integer');
      }
      const amt = BigInt(b.amount);
      if (amt < 10n || amt > 200000n) {
        throw new Error('Each Andar Bahar bet must be between 10 and 200,000 tokens');
      }
      totalRequested += amt;
      incomingMaxPayout += amt * BigInt(maxMult);
    }

    const poolWallet = await walletService.getWallet(SYSTEM_WALLETS.ANDAR_BAHAR_POOL);
    if (!poolWallet) {
      throw new Error('Andar Bahar Game Pool is unavailable');
    }

    const existingRealExposure = Array.from(this.currentBets.values())
      .filter((b) => !b.userId.startsWith('sim-'))
      .reduce((sum, b) => sum + BigInt(b.amount) * BigInt(Math.max(1, this.getMaxMultiplierForMarket(b.type))), 0n);

    if (BigInt(poolWallet.balance) + totalRequested < existingRealExposure + incomingMaxPayout) {
      throw new Error('Andar Bahar Game Pool liquidity is currently low. Please contact Admin.');
    }

    if (BigInt(userWallet.balance) < totalRequested) {
      throw new Error('Insufficient wallet balance to place bets');
    }

    await walletService.executeTransfer({
      sourceWalletId: userWallet.id,
      targetWalletId: SYSTEM_WALLETS.ANDAR_BAHAR_POOL,
      amount: totalRequested.toString(),
      type: TransactionType.BET_ESCROW_LOCK,
      idempotencyKey: params.idempotencyKey
        ? `ab-bet-${params.idempotencyKey}`
        : `ab-bet-${params.userId}-${randomId('k')}`,
      description: `Andar Bahar Bet - Round #${this.currentRound.roundNumber}`,
      metadata: { roundNumber: this.currentRound.roundNumber, betsCount: params.bets.length },
    });

    const createdBets: AndarBaharRoundBet[] = [];
    for (const b of params.bets) {
      const market = String(b.type || '').trim().toLowerCase();
      const betId = randomId('ab-bet');
      const roundBet: AndarBaharRoundBet = {
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

      if (market === 'andar') {
        this.currentRound.andarBetAmount = (
          BigInt(this.currentRound.andarBetAmount) + BigInt(b.amount)
        ).toString();
      } else if (market === 'bahar') {
        this.currentRound.baharBetAmount = (
          BigInt(this.currentRound.baharBetAmount) + BigInt(b.amount)
        ).toString();
      }

      const existing = this.userBetsMap.get(params.userId) || [];
      existing.push(betId);
      this.userBetsMap.set(params.userId, existing);
    }

    this.emit('andar_bahar:bet_placed', {
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

  private scheduleSimulatedCommunityBets() {
    const simUsers = ['karthik_pro', 'arjun_m', 'priya_reddy', 'deepak_99', 'suresh_v'];
    const delays = [1500, 3500, 6000, 8500, 10500];
    const amounts = ['50', '100', '250', '500'];

    delays.forEach((delay, idx) => {
      const t = setTimeout(() => {
        if (this.currentRound.status !== AndarBaharRoundStatus.BETTING) return;
        const u = simUsers[idx % simUsers.length];
        const side = secureRandomInt(0, 100) < 52 ? 'andar' : 'bahar';
        const amount = amounts[secureRandomInt(0, amounts.length)];

        const simBetId = randomId('sim-ab');
        const roundBet: AndarBaharRoundBet = {
          id: simBetId,
          roundId: this.currentRound.id,
          userId: `sim-${u}`,
          username: u,
          type: side,
          amount,
          createdAt: new Date().toISOString(),
        };

        this.currentBets.set(simBetId, roundBet);
        this.currentRound.totalBetsCount++;
        this.currentRound.totalBetAmount = (
          BigInt(this.currentRound.totalBetAmount) + BigInt(amount)
        ).toString();

        if (side === 'andar') {
          this.currentRound.andarBetAmount = (
            BigInt(this.currentRound.andarBetAmount) + BigInt(amount)
          ).toString();
        } else {
          this.currentRound.baharBetAmount = (
            BigInt(this.currentRound.baharBetAmount) + BigInt(amount)
          ).toString();
        }

        this.emit('andar_bahar:bet_placed', {
          roundId: this.currentRound.id,
          bets: [roundBet],
          round: this.getPublicRoundState(),
        });
      }, delay);

      this.simBetTimeouts.push(t);
    });
  }
}

export const andarBaharEngine = new ApkAndarBaharEngine();
