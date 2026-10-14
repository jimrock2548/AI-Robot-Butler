// Read-only smoke check: login, state, map, and server-pushed updates. Never sends robot commands.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/backend/package.json', import.meta.url));
const { io } = require('socket.io-client');
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).filter(line => line.includes('=') && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')]; }));
const base = 'http://localhost:4000';
const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: env.INITIAL_ADMIN_PASSWORD }) });
if (!login.ok) throw new Error(`Login failed: ${login.status}`);
const cookie = login.headers.get('set-cookie').split(';')[0];
const stateResponse = await fetch(`${base}/api/robot/state`, { headers: { cookie } });
if (!stateResponse.ok) throw new Error(`State failed: ${stateResponse.status}`);
const state = await stateResponse.json();
console.log(JSON.stringify({ link: state.linkStatus, commandsEnabled: state.commandsEnabled, motionLimits: state.motionLimits }));
await new Promise((resolve, reject) => {
  const socket = io(base, { transports: ['websocket'], extraHeaders: { cookie }, reconnection: false });
  const timestamps = new Set();
  const timer = setTimeout(() => finish(new Error('Timed out waiting for two live map updates')), 12000);
  function finish(error) { clearTimeout(timer); socket.disconnect(); error ? reject(error) : resolve(); }
  socket.on('connect_error', finish);
  socket.on('map:live', map => {
    timestamps.add(map.capturedAt);
    console.log(JSON.stringify({ mapAt: map.capturedAt, mappingEnabled: map.mappingEnabled, localizationQuality: map.localizationQuality, width: map.width, height: map.height, pois: map.pois?.length ?? null, laserPoints: map.laser?.laser_points?.length ?? null }));
    if (timestamps.size >= 2) finish();
  });
});
for (const page of ['/control', '/map']) {
  const response = await fetch(`http://localhost:3000${page}`);
  if (!response.ok) throw new Error(`Page ${page}: ${response.status}`);
  console.log(`Page ${page}: ${response.status}`);
}
