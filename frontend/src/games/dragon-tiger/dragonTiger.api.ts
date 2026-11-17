import { ApiClient } from '../../api/client';
import { UserRole } from '../../../../shared/src/types';
import { dragonTigerEngine } from './dragon-tiger.engine';

export type DragonTigerBetPayload = {
  bets: Array<{ type: string; amount: string }>;
};

export function buildDragonTigerBetOperation(
  userId: string,
  payload: DragonTigerBetPayload,
): string {
  const user = String(userId ?? '').trim();
  if (!user || !Array.isArray(payload?.bets) || payload.bets.length === 0) {
    throw new Error('DRAGON_TIGER_BET_INTENT_REQUIRED');
  }
  const canonicalPayload = {
    bets: payload.bets.map((bet) => ({
      type: String(bet.type ?? '').trim().toLowerCase(),
      amount: String(bet.amount ?? '').trim(),
    })),
  };
  return `dragon-tiger-bet:${user}:${JSON.stringify(canonicalPayload)}`;
}

export const DragonTigerApi = {
  async getState() {
    const user = ApiClient.getCurrentSessionUser();
    return {
      status: 'ACTIVE',
      round: dragonTigerEngine.getPublicRoundState(),
      history: dragonTigerEngine.getHistory(),
      allBets: dragonTigerEngine.getCurrentRoundBets(),
      myBets: user ? dragonTigerEngine.getUserBets(user.id) : [],
    };
  },

  async placeBet(payload: DragonTigerBetPayload, userId: string) {
    const user = ApiClient.getCurrentSessionUser();
    const effectiveUserId = userId || user?.id;
    if (!effectiveUserId) {
      throw new Error('Authentication required. Please sign in.');
    }
    const operation = buildDragonTigerBetOperation(effectiveUserId, payload);
    const idempotencyKey = await ApiClient.pendingKey(operation, 'DRAGON_TIGER_BET');
    try {
      return await dragonTigerEngine.placeBet({
        userId: effectiveUserId,
        username: user?.username || 'Player',
        userRole: user?.role || UserRole.PLAYER,
        bets: payload.bets.map((b) => ({
          type: String(b.type).toLowerCase() as 'dragon' | 'tiger' | 'tie',
          amount: String(b.amount),
        })),
        idempotencyKey,
      });
    } finally {
      ApiClient.clearPendingKey(operation);
    }
  },
};
