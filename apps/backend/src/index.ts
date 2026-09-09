import http from 'node:http';
import { Server } from 'socket.io';
import { config } from './config';
import { initWorld } from './db/memory';
import { createApp } from './app';
import { setupSockets } from './ws/socket';
import { startTelemetryPoller } from './services/telemetryPoller';
import { setMapIo } from './routes/maps';

async function main(): Promise<void> {
  if (config.dbMode !== 'memory') {
    throw new Error('DB_MODE=pg ยังไม่รองรับ — รันด้วย DB_MODE=memory ก่อน (เตรียม schema ไว้ที่ prisma/schema.prisma)');
  }

  const world = await initWorld();
  console.log(
    `[hermes] ready — ${world.users.length} users, ${world.robots[0].code}, ` +
      `${world.publishedPois().length} POIs, simulated robot`,
  );

  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: config.corsOrigin, credentials: true },
  });

  setMapIo(io);
  setupSockets(io);
  startTelemetryPoller(io);

  server.listen(config.port, () => {
    console.log(`[hermes] backend listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('[hermes] fatal:', err);
  process.exit(1);
});
