import { Router, Response } from 'express';
import { authenticateJWT, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { AuthService } from '../../services/auth.service';
import { UserRole } from '../../../../shared/src/types';
import { teenPattiEngine, TeenPattiAction } from './teen-patti.engine';

export const teenPattiRouter = Router();

// GET /api/games/teen-patti/state
teenPattiRouter.get('/state', (req, res: Response) => {
  const authHeader = req.headers.authorization;
  let userId: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    const payload = AuthService.verifyToken(authHeader.slice(7));
    if (payload?.id) {
      userId = payload.id;
    }
  }
  return res.json(teenPattiEngine.getPublicState(userId));
});

// GET /api/games/teen-patti/history
teenPattiRouter.get('/history', (_req, res: Response) => {
  return res.json({
    history: teenPattiEngine.getHistory(),
  });
});

// POST /api/games/teen-patti/boot (Start Heads-Up: Player vs Dealer)
teenPattiRouter.post('/boot', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  if (user.role !== UserRole.PLAYER) {
    return res.status(403).json({ error: 'Only Player accounts can play Teen Patti' });
  }

  try {
    const idempotencyKey = req.header('Idempotency-Key')?.trim() || undefined;
    const result = teenPattiEngine.startBoot({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      bootAmount: req.body?.bootAmount,
      idempotencyKey,
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to place boot bet' });
  }
});

// POST /api/games/teen-patti/action (Chaal, Blind, See, Pack, Showdown)
teenPattiRouter.post('/action', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  if (user.role !== UserRole.PLAYER) {
    return res.status(403).json({ error: 'Only Player accounts can perform Teen Patti actions' });
  }

  const action = String(req.body?.action || '').trim() as TeenPattiAction;
  if (!['see', 'chaal', 'blind', 'pack', 'showdown'].includes(action)) {
    return res.status(400).json({ error: 'Unknown action' });
  }

  try {
    const idempotencyKey = req.header('Idempotency-Key')?.trim() || undefined;
    const result = teenPattiEngine.performAction({
      userId: user.id,
      userRole: user.role,
      action,
      amount: req.body?.amount,
      idempotencyKey,
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to process Teen Patti action' });
  }
});
