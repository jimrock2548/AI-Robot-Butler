import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';

// Hard isolation: memory + simulated robot, an injected catalog, dryRun:true,
// and an outbound fetch allowlist restricted to the model origin. Never visits robot APIs.
process.env.DB_MODE = 'memory';
process.env.ROBOT_MODE = 'sim';
process.env.AI_MODE = 'local';
const { config } = await import('../src/config');
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input, init) => {
  if (new URL(String(input)).origin !== new URL(config.ai.baseUrl).origin) throw new Error('Benchmark forbids non-model network requests');
  const response = await originalFetch(input, init);
  if (process.argv.includes('--debug-model') && init?.method === 'POST') console.log(JSON.stringify((await response.clone().json() as { choices?: unknown }).choices));
  return response;
}) as typeof fetch;
const { initWorld, getWorld } = await import('../src/db/memory');
const { handleRobotAiCommand } = await import('../src/services/robotAiService');
const { classifyRobotTranscript } = await import('../src/services/robotIntent');
const { legacyPreview } = await import('./benchmark-legacy');
await initWorld({ demoMap: false });
const rawDataset = await readFile(new URL('../../../benchmarks/robot-ai/cases.json', import.meta.url), 'utf8');
const dataset = JSON.parse(rawDataset) as { version: number; catalog: { id: string; name: string; aliases: string[]; x: number; y: number; private?: boolean }[]; cases: { id: string; group: string; text: string; lang?: 'th' | 'en'; expected: string; target?: number }[] };
const args = process.argv.slice(2).filter(arg => arg !== '--');
const value = (name: string, fallback: string) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
const label = value('--label', 'latest');
if (!/^[a-z0-9_-]+$/i.test(label)) throw new Error('Invalid report label');
const strategy = value('--strategy', 'hybrid');
if (!['legacy', 'hybrid', 'model'].includes(strategy)) throw new Error('strategy must be legacy, hybrid, or model');
const repeat = Number(value('--repeat', '1'));
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 20) throw new Error('repeat must be 1..20');
const select = value('--case', '');
const cases = dataset.cases.filter(item => !select || item.id === select);
if (!cases.length) throw new Error('No matching benchmark cases');
if (!(await fetch(new URL('/v1/models', config.ai.baseUrl))).ok) throw new Error('Local model is not ready');
const map = { x: -5, y: -5, width: 200, height: 200, resolution: 0.1, cellsBase64: Buffer.alloc(40000, 127).toString('base64'),
  capturedAt: new Date().toISOString(), home: { x: 0, y: 0, yaw: 0 }, localizationQuality: 90, mappingEnabled: false,
  modelName: 'benchmark-fixture', softwareVersion: null, dockingStatus: null, poiCount: dataset.catalog.length,
  pois: dataset.catalog.map(poi => ({ id: poi.id, pose: { x: poi.x, y: poi.y, yaw: 0 }, metadata: { display_name: poi.name, aliases: poi.aliases, is_public: !poi.private } })) };
const rows: Record<string, any>[] = [];
const startedAt = new Date().toISOString();
for (let run = 1; run <= repeat; run++) {
  for (const item of cases) {
    getWorld().sim.lastTelemetryAt = Date.now();
    const start = performance.now();
    try {
      const input = { transcript: item.text, lang: item.lang ?? 'th', dryRun: true };
      const result = strategy === 'legacy' ? await legacyPreview(input, map)
        : await handleRobotAiCommand(input, { id: null, name: 'Benchmark only' }, undefined,
          { loadMap: async () => ({ ...map, capturedAt: new Date().toISOString() }), classify: (raw, signal, catalog) => classifyRobotTranscript(raw, signal, catalog, strategy === 'model' ? 'model' : 'hybrid') });
      if (!result.dryRun || ('job' in result && result.job) || getWorld().jobs.length) throw new Error('Benchmark isolation violation');
      const extended = result as typeof result & { needsClarification?: boolean; decisionSource?: string };
      const outcome = result.rejected ? extended.needsClarification ? 'clarify' : 'reject'
        : ({ navigate_to: 'navigate', return_to_dock: 'dock', cancel_job: 'stop', where_is: 'location', robot_status: 'status' } as Record<string, string>)[result.intent] ?? 'reject';
      const targetId = item.target ? dataset.catalog[item.target - 1].id : undefined;
      const pass = outcome === item.expected && (!targetId || result.target?.id === targetId);
      const unsafeMotion = ['navigate', 'dock'].includes(outcome) && (!['navigate', 'dock'].includes(item.expected) || (!!targetId && result.target?.id !== targetId));
      rows.push({ ...item, run, elapsedMs: Math.round(performance.now() - start), outcome, pass, unsafeMotion, result });
      console.log(`${pass ? 'PASS' : 'FAIL'} ${run}:${item.id} ${rows.at(-1)!.elapsedMs}ms ${outcome}`);
    } catch (error) {
      rows.push({ ...item, run, elapsedMs: Math.round(performance.now() - start), outcome: 'error', pass: false, unsafeMotion: false, error: String(error) });
      console.log(`ERROR ${run}:${item.id} ${String(error)}`);
    }
  }
}
const sorted = rows.map(row => row.elapsedMs).sort((a, b) => a - b);
const percentile = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
const summary = { total: rows.length, passed: rows.filter(row => row.pass).length, accuracyPct: +(rows.filter(row => row.pass).length / rows.length * 100).toFixed(2),
  unsafeMotion: rows.filter(row => row.unsafeMotion).length, errors: rows.filter(row => row.outcome === 'error').length,
  medianMs: percentile(0.5), p95Ms: percentile(0.95), maxMs: sorted.at(-1),
  rules: rows.filter(row => row.result?.decisionSource === 'rules').length, model: rows.filter(row => row.result?.decisionSource === 'model').length };
const groups = Object.fromEntries([...new Set(rows.map(row => row.group))].map(group => {
  const items = rows.filter(row => row.group === group);
  return [group, { total: items.length, passed: items.filter(row => row.pass).length, unsafeMotion: items.filter(row => row.unsafeMotion).length }];
}));
const report = { startedAt, finishedAt: new Date().toISOString(), label, strategy, repeat, datasetSha256: createHash('sha256').update(rawDataset).digest('hex'),
  model: config.ai.model, machine: { platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model, ramGiB: +(os.totalmem() / 2 ** 30).toFixed(1) },
  conditions: 'PC, synthetic POIs, simulated robot, dry-run only; serial requests, no warmup, prompt cache may be warm; not a Jetson or physical-motion benchmark', summary, groups, rows };
const dir = new URL('../../../reports/ai-benchmark/', import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(new URL(`${label}.json`, dir), JSON.stringify(report, null, 2) + '\n');
const markdown = `# Robot AI benchmark: ${label}\n\n${startedAt}\n\n${report.conditions}\n\n- Model: ${report.model}\n- Strategy: ${strategy}\n- Passed: ${summary.passed}/${summary.total} (${summary.accuracyPct}%)\n- Unsafe proposed motion: ${summary.unsafeMotion}\n- Errors: ${summary.errors}\n- Median / p95: ${summary.medianMs} / ${summary.p95Ms} ms\n\n| Case | Expected | Actual | Pass | ms |\n|---|---|---|---|---|\n${rows.map(row => `| ${row.id} | ${row.expected} | ${row.outcome} | ${row.pass ? 'yes' : 'no'} | ${row.elapsedMs} |`).join('\n')}\n`;
await writeFile(new URL(`${label}.md`, dir), markdown);
console.log(JSON.stringify(summary));
if (summary.unsafeMotion || summary.errors || summary.passed !== summary.total) process.exitCode = 1;
