import { Router } from 'express';
import { UserRole } from '../../../shared/src/types';
import { AuthService } from '../services/auth.service';
import { getRecentHealthFailures } from '../services/health-monitor.service';

export const healthMonitorRouter = Router();

// This read-only diagnostics endpoint must remain available when PostgreSQL is down.
// The signed JWT's OWNER claim is used here because the usual auth middleware queries
// PostgreSQL to re-check the account. No financial or account data is exposed.
function requireOwnerSignedToken(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const payload = token ? AuthService.verifyToken(token) : null;
  if (!payload || typeof payload.id !== 'string' || payload.role !== UserRole.OWNER) {
    return res.status(401).json({ error: 'OWNER_DIAGNOSTICS_AUTH_REQUIRED' });
  }
  return next();
}

healthMonitorRouter.get('/failures', requireOwnerSignedToken, async (req, res) => {
  const rawLimit = Number(req.query.limit ?? 100);
  const limit = Number.isFinite(rawLimit) ? Math.min(250, Math.max(1, Math.floor(rawLimit))) : 100;
  const result = await getRecentHealthFailures(limit);
  return res.json({
    events: result.events,
    persistence: result.persistence,
    capturedInMemoryLimit: 250,
    note: 'Running in local in-memory diagnostics mode; recent failures in this server process are shown.',
    timestamp: new Date().toISOString(),
  });
});
