import express from 'express';
import session from 'express-session';
import cors from 'cors';
import { config } from './config';
import { authRouter } from './routes/auth';
import { robotRouter } from './routes/robot';
import { jobsRouter } from './routes/jobs';
import { mapsRouter } from './routes/maps';
import { usersRouter } from './routes/users';
import { aiRouter } from './routes/ai';
import { kioskRouter } from './routes/kiosk';
import { errorHandler } from './middleware/errorHandler';
import { getWorld } from './db/memory';
import { requireAuth, requireRole } from './middleware/auth';
import { persistWorld, PostgresSessionStore } from './db/postgres';

export const sessionMiddleware = session({
  name: 'hermes.sid',
  secret: config.sessionSecret,
  store: config.dbMode === 'pg' ? new PostgresSessionStore() : undefined,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 8 * 3600 * 1000,
  },
});

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json());

  // NFR-05: httpOnly + SameSite=Strict cookie, ไม่เก็บ token ใน localStorage
  app.use(sessionMiddleware);

  if (config.dbMode === 'pg') {
    // A successful mutation is committed to PostgreSQL before its HTTP response is sent.
    app.use((req, res, next) => {
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
      const end = res.end.bind(res) as (...args: any[]) => typeof res;
      res.end = ((...args: any[]) => {
        res.end = end as typeof res.end;
        if (res.statusCode >= 400) return end(...args);
        void persistWorld().then(() => end(...args)).catch((error) => {
          console.error('[hermes] PostgreSQL write failed:', error);
          res.removeHeader('Content-Length');
          res.status(500);
          res.setHeader('Content-Type', 'application/json');
          end(JSON.stringify({ error: { code: 'storage_failed', message: 'บันทึกข้อมูลไม่สำเร็จ' } }));
        });
        return res;
      }) as typeof res.end;
      next();
    });
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, dbMode: config.dbMode, robot: config.robot.code });
  });

  // ทดสอบ NFR-08: จำลองสัญญาณหุ่นหลุดชั่วคราว (โหมด memory เท่านั้น)
  app.post('/api/dev/sim/link-drop', requireAuth, requireRole('admin'), (req, res, next) => {
    try {
      if (config.dbMode !== 'memory' || process.env.NODE_ENV === 'production') {
        res.status(404).end();
        return;
      }
      const ms = Math.min(60_000, Number(req.body?.ms ?? 12_000));
      const w = getWorld();
      w.sim.linkDropUntil = Date.now() + ms;
      res.json({ linkDropUntil: w.sim.linkDropUntil });
    } catch (e) {
      next(e);
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/robot', robotRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/maps', mapsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/kiosk', kioskRouter);

  app.use(errorHandler);
  return app;
}
