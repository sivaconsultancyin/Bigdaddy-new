import { Router, Response } from 'express';
import { aviatorEngine } from './aviator.engine';
import { authenticateJWT, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { aviatorBetSchema, aviatorCashoutSchema } from '../../../../shared/src/schemas';
import { UserRole } from '../../../../shared/src/types';
import { SYSTEM_WALLETS } from '../../../../shared/src/constants';
import { db } from '../../db/storage';

export const aviatorRouter = Router();

// GET /api/games/aviator/state
aviatorRouter.get('/state', (_req, res: Response) => {
  const poolWallet = db.getWallet(SYSTEM_WALLETS.AVIATOR_POOL);
  return res.json({
    game: 'aviator',
    name: 'Aviator / Crash',
    status: 'ACTIVE',
    minBet: '10',
    maxBet: '100000',
    poolBalance: poolWallet ? poolWallet.balance : '0',
    round: aviatorEngine.getPublicRoundState(),
    bets: aviatorEngine.getCurrentRoundBets(),
    history: aviatorEngine.getHistory(),
    serverTime: new Date().toISOString(),
  });
});

// GET /api/games/aviator/history
aviatorRouter.get('/history', (_req, res: Response) => {
  return res.json({
    history: aviatorEngine.getHistory(),
  });
});

// POST /api/games/aviator/bet (PLAYER only)
aviatorRouter.post('/bet', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  if (user.role !== UserRole.PLAYER) {
    return res.status(403).json({ error: 'Only Player accounts can place bets on casino games' });
  }

  const parseResult = aviatorBetSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message || 'Validation error' });
  }

  try {
    const idempotencyKey = req.header('Idempotency-Key')?.trim() || undefined;
    const { bet } = aviatorEngine.placeBet({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      amount: parseResult.data.amount,
      autoCashoutMultiplier: parseResult.data.autoCashoutMultiplier ?? null,
      idempotencyKey,
    });

    const wallet = db.getWalletByUserId(user.id);
    return res.status(201).json({
      bet,
      round: aviatorEngine.getPublicRoundState(),
      walletBalance: wallet?.balance ?? '0',
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Error placing Aviator bet' });
  }
});

// POST /api/games/aviator/cashout (PLAYER only)
aviatorRouter.post('/cashout', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  if (user.role !== UserRole.PLAYER) {
    return res.status(403).json({ error: 'Only Player accounts can cash out bets' });
  }

  const parseResult = aviatorCashoutSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message || 'Validation error' });
  }

  try {
    const { result, bet } = aviatorEngine.cashoutBet({
      betId: parseResult.data.betId,
      userId: user.id,
    });

    const wallet = db.getWalletByUserId(user.id);
    return res.json({
      result,
      bet,
      walletBalance: wallet?.balance ?? '0',
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Cashout failed' });
  }
});
