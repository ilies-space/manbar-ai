const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/live/api.js'), 'utf8');
let version = 0;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
async function withApi(mock, run) {
  const original = global.fetch;
  global.fetch = mock;
  try {
    const api = await import('data:text/javascript;base64,' + Buffer.from(source + `\n// test ${version++}`).toString('base64'));
    await run(api);
  } finally { global.fetch = original; }
}

test('shares a single health probe and prefers a ready n8n backend', async () => {
  let probes = 0;
  await withApi(async () => { probes++; return json({ ok: true, key: true }); }, async api => {
    const results = await Promise.all([api.apiResolve(), api.apiResolve()]);
    assert.equal(probes, 1);
    assert.equal(results[0].name, 'n8n');
    assert.deepEqual(results[0], results[1]);
  });
});

test('an n8n health response without an explicit key does not enable AI', async () => {
  await withApi(async url => json(url === '/api/health' ? { ok: true, key: true } : { ok: true }), async api => {
    assert.equal((await api.apiResolve()).name, 'local');
  });
});

test('a later n8n request failure retries the local API', async () => {
  const calls = [];
  await withApi(async url => {
    calls.push(url);
    if (url.endsWith('manbar-gloss')) return json({ error: 'provider' }, 502);
    if (url === '/api/gloss') return json({ glosses: ['GLOSS_ALLAH'] });
    return json({ ok: true, key: true });
  }, async api => {
    assert.deepEqual(await api.apiRequest('gloss', { method: 'POST', body: '{}' }), { glosses: ['GLOSS_ALLAH'] });
    assert.equal(api.apiCurrent().name, 'local');
    assert.ok(calls.includes('/api/health'));
  });
});

test('invalid ASR responses cannot appear as successful silence', async () => {
  await withApi(async url => {
    if (url.endsWith('health')) return json({ ok: true, key: true });
    return json({ error: 'invalid audio' });
  }, async api => {
    await assert.rejects(api.apiRequest('asr', { method: 'POST' }), /Invalid backend response/);
  });
});

test('offline backend resolution disables API calls', async () => {
  await withApi(async () => { throw new Error('offline'); }, async api => {
    assert.equal((await api.apiResolve()).name, 'none');
    await assert.rejects(api.apiRequest('gloss', { method: 'POST' }), /No AI backend/);
  });
});
