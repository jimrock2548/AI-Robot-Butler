// Kiosk proxy check; every navigation request is dry-run, and chat only asks location.
const base = 'http://localhost:3001/api/kiosk';
const status = await (await fetch(base + '/ai-status')).json();
console.log(JSON.stringify(status));
if (!status.textReady || status.simulated) throw new Error('Real-robot kiosk AI is not ready');
const destinations = await (await fetch(base + '/destinations')).json();
const poi = destinations.items?.[0];
if (!poi) throw new Error('Add a robot POI before checking kiosk navigation');
for (const transcript of [`เดินไปที่${poi.nameTh}`, `ช่วยพาไปที่${poi.nameTh}หน่อย`, `ไปส่งที่${poi.nameTh}ได้ไหมครับ`, `${poi.nameTh}คือจุดหมายของผม คุณช่วยไปส่งผมที่นั่นได้ไหม`]) {
const preview = await fetch(base + '/intent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript, lang: 'th', dryRun: true }) });
const result = await preview.json();
console.log(JSON.stringify(result));
if (!preview.ok || !result.dryRun || result.job || result.intent !== 'navigate_to' || result.target?.id !== poi.code) throw new Error('Kiosk command preview failed');
}
const chat = await fetch(base + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: 'th', messages: [{ role: 'user', content: `${poi.nameTh}อยู่ที่ไหน` }] }) });
const body = await chat.text();
if (!chat.ok) throw new Error(`Chat failed: ${chat.status}`);
const events = body.trim().split('\n').map(line => JSON.parse(line));
if (events.some(event => event.type === 'error' || event.job) || !events.some(event => event.type === 'done')) throw new Error('Location question failed or unexpectedly dispatched a job');
console.log(JSON.stringify({ route: events.find(event => event.type === 'route')?.route, reply: events.filter(event => event.type === 'delta').map(event => event.text).join('') }));
console.log('Kiosk AI proxy and local-model chat passed without sending movement commands.');
