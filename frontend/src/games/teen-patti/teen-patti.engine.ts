import { TransactionType, UserRole } from '../../../../shared/src/types';
import { SYSTEM_WALLETS } from '../../../../shared/src/constants';
import { walletService } from '../../services/supabaseWallet';
import {
  Card,
  HandEvaluation,
  createDeck,
  shuffleDeck,
  evaluateTeenPattiHand,
  compareHands,
} from '../../../../shared/src/utils/teenPatti';
import { randomId } from '../../utils/rng';

export type TeenPattiAction = 'see' | 'chaal' | 'blind' | 'pack' | 'showdown';
export type TeenPattiEventListener = (event: string, data: any) => void;

export interface TeenPattiPlayer {
  id: string;
  name: string;
  isAi: boolean;
  cards: Card[];
  isSeen: boolean;
  hasFolded: boolean;
  totalBet: number;
}

export interface ActiveTeenPattiTable {
  roundId: string;
  roundNumber: number;
  bootAmount: number;
  currentStake: number;
  pot: number;
  status: 'BETTING' | 'SHOWDOWN' | 'SETTLED';
  players: TeenPattiPlayer[];
  winnerId: string | null;
  winnerHand: string | null;
  winAmount: number;
}

export interface SanitizedTeenPattiPlayer {
  id: string;
  name: string;
  isAi: boolean;
  isSeen: boolean;
  hasFolded: boolean;
  totalBet: number;
  cards: Card[] | null;
  handEvaluation: HandEvaluation | null;
}

export interface SanitizedTeenPattiTable {
  roundId: string;
  roundNumber: number;
  bootAmount: number;
  currentStake: number;
  pot: number;
  status: 'BETTING' | 'SHOWDOWN' | 'SETTLED';
  players: SanitizedTeenPattiPlayer[];
  winnerId: string | null;
  winnerHand: string | null;
  winAmount: number;
}

export interface TeenPattiHistoryItem {
  roundId: string;
  roundNumber: number;
  winnerId: string;
  winnerHand: string;
  winAmount: number;
  pot: number;
  timestamp: string;
}

export const TEEN_PATTI_HAND_RANKINGS = [
  { rank: 1, name: 'Trail (Trio / AAA)', multiplier: '40x' },
  { rank: 2, name: 'Pure Sequence (Straight Flush)', multiplier: '20x' },
  { rank: 3, name: 'Sequence (Run / AKQ)', multiplier: '8x' },
  { rank: 4, name: 'Color (Flush)', multiplier: '4x' },
  { rank: 5, name: 'Pair (Double)', multiplier: '2x' },
  { rank: 6, name: 'High Card', multiplier: '1x' },
];

export class ApkTeenPattiEngine {
  private activeTables: Map<string, ActiveTeenPattiTable> = new Map();
  private idempotencyResults: Map<string, any> = new Map();
  private history: TeenPattiHistoryItem[] = [];
  private listeners: Set<TeenPattiEventListener> = new Set();
  private globalRoundCounter = 101;

  public readonly MIN_BOOT = 10;
  public readonly MAX_BOOT = 500000;

  public subscribe(listener: TeenPattiEventListener) {
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

  public getHandRankings() {
    return TEEN_PATTI_HAND_RANKINGS;
  }

  public getHistory(): TeenPattiHistoryItem[] {
    return [...this.history];
  }

  public getActiveTable(userId: string): SanitizedTeenPattiTable | null {
    const table = this.activeTables.get(userId);
    if (!table) return null;
    return this.sanitizeTableForClient(table, userId, table.status === 'SETTLED');
  }

  public async getPublicState(userId?: string) {
    const poolBalance = await walletService.getPoolBalance(SYSTEM_WALLETS.TEEN_PATTI_POOL);
    return {
      game: 'teen-patti',
      name: 'Teen Patti Royal (Player vs Dealer)',
      status: 'ACTIVE',
      minBet: '50',
      maxBet: '500000',
      poolBalance,
      handRankings: this.getHandRankings(),
      table: userId ? this.getActiveTable(userId) : null,
      history: this.getHistory(),
    };
  }

  public async startBoot(params: {
    userId: string;
    username: string;
    userRole: UserRole;
    bootAmount?: number | string;
    idempotencyKey?: string;
  }) {
    if (params.userRole !== UserRole.PLAYER) {
      throw new Error('Only Player accounts can play Teen Patti');
    }

    if (params.idempotencyKey && this.idempotencyResults.has(params.idempotencyKey)) {
      return this.idempotencyResults.get(params.idempotencyKey);
    }

    const userWallet = await walletService.getWalletByUserId(params.userId, UserRole.PLAYER);
    if (!userWallet) {
      throw new Error('User wallet not found');
    }

    const rawBoot = params.bootAmount === undefined || params.bootAmount === null ? 50 : Number(params.bootAmount);
    if (!Number.isInteger(rawBoot) || rawBoot < this.MIN_BOOT || rawBoot > this.MAX_BOOT) {
      throw new Error(`Boot amount must be an integer between ₹${this.MIN_BOOT} and ₹${this.MAX_BOOT}`);
    }

    const bootAmount = rawBoot;
    if (BigInt(userWallet.balance) < BigInt(bootAmount)) {
      throw new Error(`Insufficient balance for boot amount ₹${bootAmount}`);
    }

    const poolWalletCheck = await walletService.getWallet(SYSTEM_WALLETS.TEEN_PATTI_POOL);
    if (!poolWalletCheck || BigInt(poolWalletCheck.balance) < BigInt(bootAmount)) {
      throw new Error('Teen Patti Game Pool liquidity is currently low. Please contact Admin.');
    }

    const nextRoundNumber = this.globalRoundCounter + 1;
    const txKey = params.idempotencyKey
      ? `TP_BOOT_${params.idempotencyKey}`
      : `tp-boot-${params.userId}-${randomId('k')}`;

    await walletService.executeTransfer({
      sourceWalletId: userWallet.id,
      targetWalletId: SYSTEM_WALLETS.TEEN_PATTI_POOL,
      amount: bootAmount.toString(),
      type: TransactionType.BET_ESCROW_LOCK,
      idempotencyKey: txKey,
      description: `Teen Patti Boot Stake - Round #${nextRoundNumber}`,
      metadata: { game: 'teen-patti', roundNumber: nextRoundNumber, bootAmount },
    });

    this.globalRoundCounter = nextRoundNumber;
    const deck = shuffleDeck(createDeck());
    const playerCards = [deck[0], deck[1], deck[2]];
    const dealerCards = [deck[3], deck[4], deck[5]];
    const roundId = `tp-round-${Date.now()}-${nextRoundNumber}`;

    const table: ActiveTeenPattiTable = {
      roundId,
      roundNumber: nextRoundNumber,
      bootAmount,
      currentStake: bootAmount,
      pot: bootAmount * 2,
      status: 'BETTING',
      players: [
        {
          id: params.userId,
          name: params.username,
          isAi: false,
          cards: playerCards,
          isSeen: false,
          hasFolded: false,
          totalBet: bootAmount,
        },
        {
          id: 'dealer',
          name: 'Dealer',
          isAi: true,
          cards: dealerCards,
          isSeen: false,
          hasFolded: false,
          totalBet: bootAmount,
        },
      ],
      winnerId: null,
      winnerHand: null,
      winAmount: 0,
    };

    this.activeTables.set(params.userId, table);

    const updatedWallet = await walletService.getWalletByUserId(params.userId, UserRole.PLAYER);
    const poolBalance = await walletService.getPoolBalance(SYSTEM_WALLETS.TEEN_PATTI_POOL);
    const sanitized = this.sanitizeTableForClient(table, params.userId);

    this.emit('teen_patti:round_started', {
      userId: params.userId,
      table: sanitized,
    });

    const result = {
      table: sanitized,
      wallet: updatedWallet,
      poolBalance,
    };

    if (params.idempotencyKey) {
      this.rememberIdempotentResult(params.idempotencyKey, result);
    }

    return result;
  }

  public async performAction(params: {
    userId: string;
    userRole: UserRole;
    action: TeenPattiAction;
    amount?: number | string;
    idempotencyKey?: string;
  }) {
    if (params.userRole !== UserRole.PLAYER) {
      throw new Error('Only Player accounts can perform Teen Patti actions');
    }

    if (params.idempotencyKey && this.idempotencyResults.has(params.idempotencyKey)) {
      return this.idempotencyResults.get(params.idempotencyKey);
    }

    const table = this.activeTables.get(params.userId);
    if (!table) {
      throw new Error('No active Teen Patti game found. Please start a round.');
    }
    if (table.status !== 'BETTING') {
      throw new Error('This Teen Patti round is already settled. Please start a new round.');
    }

    const player = table.players.find((p) => p.id === params.userId);
    const dealer = table.players.find((p) => p.id === 'dealer');
    if (!player || !dealer || player.hasFolded) {
      throw new Error('Invalid move state');
    }

    const userWallet = await walletService.getWalletByUserId(params.userId, UserRole.PLAYER);
    if (!userWallet) {
      throw new Error('User wallet not found');
    }

    if (params.action === 'see') {
      player.isSeen = true;
      const sanitized = this.sanitizeTableForClient(table, params.userId);
      this.emit('teen_patti:cards_seen', { userId: params.userId, roundId: table.roundId });
      return {
        table: sanitized,
        wallet: userWallet,
      };
    }

    if (params.action === 'pack') {
      player.hasFolded = true;
      table.status = 'SETTLED';
      table.winnerId = 'dealer';
      table.winnerHand = evaluateTeenPattiHand(dealer.cards).name;
      table.winAmount = table.pot;

      this.recordHistory(table);

      const sanitized = this.sanitizeTableForClient(table, params.userId, true);
      const poolBalance = await walletService.getPoolBalance(SYSTEM_WALLETS.TEEN_PATTI_POOL);
      this.emit('teen_patti:round_settled', { userId: params.userId, table: sanitized });

      const result = {
        table: sanitized,
        wallet: userWallet,
        poolBalance,
      };
      if (params.idempotencyKey) {
        this.rememberIdempotentResult(params.idempotencyKey, result);
      }
      return result;
    }

    if (params.action === 'chaal' || params.action === 'blind') {
      const requestedAmount =
        params.amount === undefined || params.amount === null
          ? player.isSeen
            ? table.currentStake * 2
            : table.currentStake
          : Number(params.amount);

      if (!Number.isInteger(requestedAmount) || requestedAmount < this.MIN_BOOT || requestedAmount > this.MAX_BOOT) {
        throw new Error(`Bet amount must be an integer between ₹${this.MIN_BOOT} and ₹${this.MAX_BOOT}`);
      }

      if (BigInt(userWallet.balance) < BigInt(requestedAmount)) {
        throw new Error('Insufficient balance for Chaal');
      }

      const poolWalletCheck = await walletService.getWallet(SYSTEM_WALLETS.TEEN_PATTI_POOL);
      if (!poolWalletCheck || BigInt(poolWalletCheck.balance) < BigInt(table.pot + requestedAmount)) {
        throw new Error('Teen Patti Game Pool liquidity is currently low. Please contact Admin.');
      }

      const txKey = params.idempotencyKey
        ? `TP_BET_${params.idempotencyKey}`
        : `tp-bet-${params.userId}-${randomId('k')}`;

      await walletService.executeTransfer({
        sourceWalletId: userWallet.id,
        targetWalletId: SYSTEM_WALLETS.TEEN_PATTI_POOL,
        amount: requestedAmount.toString(),
        type: TransactionType.BET_ESCROW_LOCK,
        idempotencyKey: txKey,
        description: `Teen Patti ${params.action.toUpperCase()} bet vs Dealer`,
        metadata: { roundId: table.roundId, action: params.action, amount: requestedAmount },
      });

      player.totalBet += requestedAmount;
      dealer.totalBet += requestedAmount;
      table.pot += requestedAmount * 2;

      const updatedWallet = await walletService.getWalletByUserId(params.userId, UserRole.PLAYER);
      const poolBalance = await walletService.getPoolBalance(SYSTEM_WALLETS.TEEN_PATTI_POOL);
      const sanitized = this.sanitizeTableForClient(table, params.userId);

      this.emit('teen_patti:bet_placed', {
        userId: params.userId,
        roundId: table.roundId,
        action: params.action,
        amount: requestedAmount,
        pot: table.pot,
      });

      const result = {
        table: sanitized,
        wallet: updatedWallet,
        poolBalance,
      };

      if (params.idempotencyKey) {
        this.rememberIdempotentResult(params.idempotencyKey, result);
      }

      return result;
    }

    if (params.action === 'showdown') {
      table.status = 'SETTLED';
      player.isSeen = true;
      dealer.isSeen = true;

      const comparison = compareHands(player.cards, dealer.cards);
      const playerWon = comparison >= 0;

      const bestPlayer = playerWon ? player : dealer;
      const bestHandEval = evaluateTeenPattiHand(bestPlayer.cards);

      table.winnerId = bestPlayer.id;
      table.winnerHand = `${bestHandEval.name} - ${bestHandEval.description}`;
      table.winAmount = table.pot;

      if (playerWon) {
        try {
          await walletService.executeTransfer({
            sourceWalletId: SYSTEM_WALLETS.TEEN_PATTI_POOL,
            targetWalletId: userWallet.id,
            amount: table.pot.toString(),
            type: TransactionType.BET_WIN_PAYOUT,
            idempotencyKey: `tp-win-${params.userId}-${table.roundId}`,
            description: `Teen Patti Win Payout vs Dealer - Round #${table.roundNumber}`,
            metadata: { roundId: table.roundId, winAmount: table.pot, hand: table.winnerHand },
          });
        } catch (err) {
          console.error('Teen Patti win payout error:', err);
        }
      }

      this.recordHistory(table);

      const updatedWallet = await walletService.getWalletByUserId(params.userId, UserRole.PLAYER);
      const poolBalance = await walletService.getPoolBalance(SYSTEM_WALLETS.TEEN_PATTI_POOL);
      const sanitized = this.sanitizeTableForClient(table, params.userId, true);

      this.emit('teen_patti:round_settled', { userId: params.userId, table: sanitized });

      const result = {
        table: sanitized,
        wallet: updatedWallet,
        poolBalance,
      };

      if (params.idempotencyKey) {
        this.rememberIdempotentResult(params.idempotencyKey, result);
      }

      return result;
    }

    throw new Error('Unknown action');
  }

  private recordHistory(table: ActiveTeenPattiTable) {
    this.history.unshift({
      roundId: table.roundId,
      roundNumber: table.roundNumber,
      winnerId: table.winnerId || 'dealer',
      winnerHand: table.winnerHand || 'Settled',
      winAmount: table.winAmount,
      pot: table.pot,
      timestamp: new Date().toISOString(),
    });
    if (this.history.length > 20) {
      this.history.pop();
    }
  }

  private rememberIdempotentResult(key: string, value: any) {
    this.idempotencyResults.set(key, value);
    if (this.idempotencyResults.size > 500) {
      const oldest = this.idempotencyResults.keys().next().value;
      if (oldest) this.idempotencyResults.delete(oldest);
    }
  }

  private sanitizeTableForClient(
    table: ActiveTeenPattiTable,
    currentUserId: string,
    revealAll = false
  ): SanitizedTeenPattiTable {
    return {
      ...table,
      players: table.players.map((p) => {
        const isSelf = p.id === currentUserId;
        const canSee = revealAll || (isSelf && p.isSeen);
        return {
          id: p.id,
          name: p.name,
          isAi: p.isAi,
          isSeen: p.isSeen,
          hasFolded: p.hasFolded,
          totalBet: p.totalBet,
          cards: canSee ? p.cards : null,
          handEvaluation: canSee ? evaluateTeenPattiHand(p.cards) : null,
        };
      }),
    };
  }
}

export const teenPattiEngine = new ApkTeenPattiEngine();
