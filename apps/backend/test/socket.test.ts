import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { createApp, sessionMiddleware } from '../src/app';
import { initWorld } from '../src/db/memory';
import { setupSockets } from '../src/ws/socket';

test('websocket uses the login session and rejects anonymous clients', async () => {
  await initWorld();
  const server = http.createServer(createApp());
  const io = new Server(server);
  io.engine.use(sessionMiddleware);
  setupSockets(io);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;

  try {
    const anonymous = connect(base, { transports: ['websocket'], reconnection: false });
    const anonymousError = await new Promise<Error>((resolve) => anonymous.once('connect_error', resolve));
    assert.equal(anonymousError.message, 'unauthorized');
    anonymous.disconnect();

    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'operator', password: 'operator123' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);

    const authorized = connect(base, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { Cookie: cookie },
    });
    await new Promise<void>((resolve, reject) => {
      authorized.once('connect', resolve);
      authorized.once('connect_error', reject);
    });
    assert.equal(authorized.connected, true);
    authorized.disconnect();
  } finally {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
