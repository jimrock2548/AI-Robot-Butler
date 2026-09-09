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

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json());

  // NFR-05: httpOnly + SameSite=Strict cookie, ไม่เก็บ token ใน localStorage
  app.use(
    session({
      name: 'hermes.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 8 * 3600 * 1000,
      },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, dbMode: config.dbMode, robot: config.robot.code });
  });

  // ทดสอบ NFR-08: จำลองสัญญาณหุ่นหลุดชั่วคราว (โหมด memory เท่านั้น)
  app.post('/api/dev/sim/link-drop', (req, res, next) => {
    try {
      if (config.dbMode !== 'memory') {
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
