import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWorld, initWorld } from '../src/db/memory';
import { handleKioskIntent, type AiDecision } from '../src/services/aiService';

const request = { transcript: 'พาไปห้อง 101', lang: 'th' };
const choose = (decision: AiDecision) => async () => decision;

test('AI harness rejects uncertain and restricted destinations, then routes an allowed job and cancellation', async () => {
  await initWorld();
  const w = getWorld();
  w.sim.lastTelemetryAt = Date.now();

  const uncertain = await handleKioskIntent(request, choose({ intent: 'navigate_to', confidence: 0.2, poiCode: '101' }));
  assert.equal(uncertain.rejected, true);
  assert.equal(w.aiRejections.at(-1)?.reason, 'low_confidence');
  assert.equal(w.jobs.length, 0);

  const restricted = await handleKioskIntent(request, choose({ intent: 'navigate_to', confidence: 0.99, poiCode: 'SVR' }));
  assert.equal(restricted.rejected, true);
  assert.equal(w.aiRejections.at(-1)?.reason, 'restricted_poi');
  assert.equal(w.jobs.length, 0);

  const location = await handleKioskIntent({ transcript: 'ห้อง 102 อยู่ที่ไหน', lang: 'th' }, async () => {
    throw new Error('A clear public-POI location request must bypass model inference');
  });
  assert.equal(location.rejected, false);
  assert.match(location.replyText, /ฝั่งซ้าย/);
  assert.equal(w.jobs.length, 0);

  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(
    handleKioskIntent(request, choose({ intent: 'navigate_to', confidence: 0.99, poiCode: '101' }), cancelled.signal),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ai_cancelled',
  );
  assert.equal(w.jobs.length, 0);

  const accepted = await handleKioskIntent(request, choose({ intent: 'navigate_to', confidence: 0.99, poiCode: '101' }));
  assert.equal(accepted.rejected, false);
  assert.equal(accepted.job?.source, 'kiosk_voice');
  assert.equal(w.activeJob()?.destPoiCode, '101');

  const busy = await handleKioskIntent({ transcript: 'ห้อง 102 อยู่ที่ไหน', lang: 'th' },
    choose({ intent: 'where_is', confidence: 0.99, poiCode: '102' }));
  assert.equal(busy.rejected, true);
  assert.equal(w.aiRejections.at(-1)?.reason, 'job_in_progress');

  const stopped = await handleKioskIntent({ transcript: 'หยุด', lang: 'th' }, async () => {
    throw new Error('Stop must bypass model inference');
  });
  assert.equal(stopped.rejected, false);
  assert.equal(w.activeJob(), undefined);

  const unavailable = await handleKioskIntent({ transcript: 'เรียกเจ้าหน้าที่', lang: 'th' },
    choose({ intent: 'call_reception', confidence: 0.99, poiCode: null }));
  assert.equal(unavailable.rejected, true);
  assert.equal(w.aiRejections.at(-1)?.reason, 'tool_unavailable');
  assert.equal(w.aiConversations.length, 7);
  assert.equal(w.aiRejections.length, 4);
});
