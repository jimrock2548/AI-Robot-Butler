// Safe only in connected mock mode. Never executes against real hardware.
const base = 'http://localhost:4000/api';
const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
if (!login.ok) throw new Error('Mock demo login failed');
const cookie = login.headers.get('set-cookie')?.split(';')[0];
const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
const read = async path => { const r = await fetch(base + path, { headers }); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); };
let initial = await read('/robot/state');
for (let attempt = 0; attempt < 8 && initial.mockConnected && initial.linkStatus !== 'ok'; attempt++) {
  await new Promise(resolve => setTimeout(resolve, 500)); initial = await read('/robot/state');
}
if (!initial.simulated || !initial.mockConnected || initial.linkStatus !== 'ok') throw new Error('Not a connected mock; refuse all mutations');
if (initial.currentJob || initial.lock.heldBy !== null) throw new Error('Mock is in use; skip command checks');
const map = await read('/robot/live-map');
if (map.poiCount < 4 || map.laser?.laser_points.length !== 360) throw new Error('Mock map is incomplete');
const publicDestinations = await (await fetch('http://localhost:3001/api/kiosk/destinations')).json();
if (publicDestinations.items?.length !== 4) throw new Error('Kiosk POIs missing');
const preview = await fetch('http://localhost:3001/api/kiosk/intent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: 'ช่วยพาไปหน้าประตูหน่อย', lang: 'th', dryRun: true }) });
const intent = await preview.json();
if (!preview.ok || intent.rejected || intent.target?.name !== 'หน้าประตู' || intent.job) throw new Error('Mock AI preview failed');
const navigate = await fetch(base + '/robot/navigate', { method: 'POST', headers, body: JSON.stringify({ x: initial.telemetry.x + 1, y: initial.telemetry.y }) });
const job = await navigate.json();
if (!navigate.ok || !job.id) throw new Error('Mock navigation failed');
try {
  await new Promise(resolve => setTimeout(resolve, 1300));
  const moving = await read('/robot/state');
  if (moving.telemetry.x === initial.telemetry.x && moving.telemetry.y === initial.telemetry.y) throw new Error('Mock pose did not move');
  console.log(JSON.stringify({ mockConnected: true, link: initial.linkStatus, poiCount: map.poiCount, lidarPoints: map.laser.laser_points.length, aiTarget: intent.target.name, simulatedNavigation: true }));
} finally {
  const current = await read('/robot/state');
  if (current.currentJob?.id === job.id) {
    const cancelled = await fetch(base + `/jobs/${job.id}/cancel`, { method: 'POST', headers, body: JSON.stringify({ reason: 'Mock smoke check complete' }) });
    if (!cancelled.ok) throw new Error('Could not cancel our mock test job');
  }
}
console.log('Connected mock map, kiosk, AI preview and local navigation passed. No real hardware.');
