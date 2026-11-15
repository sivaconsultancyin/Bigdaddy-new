import express from 'express';
import http from 'http';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { config, getPublicConfigInfo } from './backend/src/config';
import { authRouter } from './backend/src/routes/auth.routes';
import { walletRouter } from './backend/src/routes/wallet.routes';
import { tokenRequestRouter } from './backend/src/routes/tokenRequest.routes';
import { gameRouter } from './backend/src/routes/game.routes';
import { auditRouter } from './backend/src/routes/audit.routes';
import { healthMonitorRouter } from './backend/src/routes/health-monitor.routes';
import { aviatorRouter } from './backend/src/games/aviator/aviator.routes';
import { rouletteRouter } from './backend/src/games/roulette/roulette.routes';
import { diceRouter } from './backend/src/games/dice/dice.routes';
import { dragonTigerRouter } from './backend/src/games/dragon-tiger/dragon-tiger.routes';
import { andarBaharRouter } from './backend/src/games/andar-bahar/andar-bahar.routes';
import { teenPattiRouter } from './backend/src/games/teen-patti/teen-patti.routes';
import { recordHealthFailure } from './backend/src/services/health-monitor.service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function wrapAsyncRouter(router: any) {
  for (const layer of router.stack ?? []) {
    for (const routeLayer of layer.route?.stack ?? []) {
      const handler = routeLayer.handle;
      if (handler?.constructor?.name !== 'AsyncFunction' || handler.__asyncErrorWrapped) continue;
      const wrapped = (req: express.Request, res: express.Response, next: express.NextFunction) => {
        Promise.resolve(handler(req, res, next)).catch(next);
      };
      (wrapped as any).__asyncErrorWrapped = true;
      routeLayer.handle = wrapped;
    }
  }
}

async function startServer() {
  const routers = [
    authRouter,
    walletRouter,
    tokenRequestRouter,
    gameRouter,
    auditRouter,
    healthMonitorRouter,
    aviatorRouter,
    rouletteRouter,
    diceRouter,
    dragonTigerRouter,
    andarBaharRouter,
    teenPattiRouter,
  ];
  routers.forEach(wrapAsyncRouter);

  const app = express();

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use(express.json({ limit: '256kb' }));

  app.use((req, res, next) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    res.setHeader('X-Request-Id', requestId);
    const originalJson = res.json.bind(res);
    (res as any).json = (body: any) => {
      if (body && typeof body === 'object') {
        if (!res.locals.healthReasonCode) {
          res.locals.healthReasonCode = typeof body.error === 'string' ? body.error : typeof body.code === 'string' ? body.code : '';
        }
        if (!res.locals.healthReason) {
          res.locals.healthReason = typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : '';
        }
      }
      return originalJson(body);
    };
    res.once('finish', () => {
      const statusCode = res.statusCode;
      const durationMs = Date.now() - startedAt;
      const pathName = req.path;
      const expectedValidationProbe = ['/auth/login', '/auth/register-referral', '/auth/create-user'].includes(pathName) && [400, 422].includes(statusCode);
      const healthPanelProbe = pathName === '/monitoring/failures';
      const shouldRecord = !healthPanelProbe && !expectedValidationProbe &&
        (statusCode >= 500 || durationMs >= 5000 || (statusCode === 401 && pathName === '/auth/login') || (statusCode >= 400 && statusCode < 500 && ![401, 403].includes(statusCode)));
      if (shouldRecord) {
        recordHealthFailure({
          requestId,
          method: req.method,
          path: pathName,
          statusCode,
          durationMs,
          reasonCode: res.locals.healthReasonCode || (durationMs >= 5000 ? 'SLOW_REQUEST' : `HTTP_${statusCode}`),
          reason: res.locals.healthReason || (durationMs >= 5000 ? 'Request took longer than 5 seconds.' : `Request completed with HTTP ${statusCode}.`),
        });
      }
    });
    next();
  });

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const allowed =
        config.corsOrigins.length === 0 ||
        config.corsOrigins.includes('*') ||
        config.corsOrigins.includes(origin);
      if (!allowed) {
        return res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' });
      }
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Idempotency-Key');
    res.header('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'BigDaddy Casino Local Server',
      mode: config.mode,
      databaseConnected: true,
      businessDataPersistence: 'IN_MEMORY_LEDGER',
      productionFinancialApisEnabled: true,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/ready', (_req, res) => {
    res.json({
      ready: true,
      reason: null,
      databaseConnected: true,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/config', (_req, res) => {
    res.json(getPublicConfigInfo());
  });

  app.use('/api/monitoring', healthMonitorRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/requests', tokenRequestRouter);
  app.use('/api/games/aviator', aviatorRouter);
  app.use('/api/games/roulette', rouletteRouter);
  app.use('/api/games/dice', diceRouter);
  app.use(['/api/games/dragon-tiger', '/api/games/dragon_tiger'], dragonTigerRouter);
  app.use(['/api/games/andar-bahar', '/api/games/andar_bahar'], andarBaharRouter);
  app.use(['/api/games/teen-patti', '/api/games/teen_patti'], teenPattiRouter);
  app.use('/api/games', gameRouter);
  app.use('/api/audit', auditRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(error);
    const detail = error instanceof Error ? error.message : String(error);
    res.locals.healthReasonCode = 'UNHANDLED_API_EXCEPTION';
    res.locals.healthReason = 'Unhandled backend exception.';
    console.error('Unhandled API request failure:', detail);
    return res.status(500).json({ error: 'REQUEST_FAILED', message: 'Internal server error. Please retry.' });
  });

  const server = http.createServer(app);

  if (process.env.NODE_ENV === 'production' && !process.env.DEV_MODE) {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = config.port;
  server.listen(port, '0.0.0.0', () => {
    console.log(`🎰 BigDaddy Casino standalone server listening on http://0.0.0.0:${port}`);
    console.log(`📌 Operational Mode: ${config.mode.toUpperCase()} (Local In-Memory Ledger + HTTP Polling)`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start BigDaddy Casino server:', err);
  process.exit(1);
});
