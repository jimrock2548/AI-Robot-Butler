import http from 'node:http';
import { Server } from 'socket.io';
import { config } from './config';
import { getWorld, initWorld } from './db/memory';
import { createApp, sessionMiddleware } from './app';
import { setupSockets } from './ws/socket';
import { startTelemetryPoller } from './services/telemetryPoller';
import { setMapIo } from './routes/maps';
import { initPostgresWorld } from './db/postgres';
import { hermes } from './hermes/driver';
import { startLiveMapPoller } from './services/liveMapService';
import { initializeRobotControl } from './services/robotControlService';
import { initializeAiSettings } from './services/aiSettings';

async function main(): Promise<void> {
  if (config.robotMode === 'hermes' && !config.robot.readOnly && config.dbMode !== 'pg') throw new Error('Hermes movement requires DB_MODE=pg');
  if (process.env.NODE_ENV === 'production') {
    if (config.dbMode !== 'pg') throw new Error('Production requires DB_MODE=pg');
    if (config.sessionSecret.length < 32 || config.sessionSecret === 'dev-only-secret-change-me') {
      throw new Error('Production requires a random SESSION_SECRET of at least 32 characters');
    }
    if (config.kioskToken.length < 32 || config.kioskToken === 'dev-kiosk-token') {
      throw new Error('Production requires a random KIOSK_TOKEN of at least 32 characters');
    }
  }
  if (config.dbMode === 'pg') await initPostgresWorld();
  else await initWorld({ demoMap: config.robotMode === 'sim' });
  await initializeAiSettings();
  await initializeRobotControl();
  const world = getWorld();
  if (hermes) world.sim.lastTelemetryAt = 0;
  console.log(
    `[hermes] ready — ${world.users.length} users, ${world.robots[0].code}, ` +
      `${world.publishedPois().length} POIs, ${config.robotMode === 'mock' ? 'MOCK TEST (no hardware)' : hermes ? 'Hermes REST' : 'simulated robot'}`,
  );

  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: config.corsOrigin, credentials: true },
  });
  io.engine.use(sessionMiddleware);

  setMapIo(io);
  setupSockets(io);
  startTelemetryPoller(io);
  startLiveMapPoller(io);

  server.listen(config.port, () => {
    console.log(`[hermes] backend listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('[hermes] fatal:', err);
  process.exit(1);
});
