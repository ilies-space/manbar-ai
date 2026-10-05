const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');

let child;
let baseUrl;

before(async () => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', OPENAI_API_KEY: 'test-only' },
    stdio: 'ignore'
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      assert.equal(response.status, 200);
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  throw new Error('Development server did not start');
});

after(async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
});

test('serves the application files', async () => {
  for (const file of ['/', '/live.html', '/js/live/player.js', '/assets/lexicon/signs.json', '/tools/pose-editor.html']) {
    const response = await fetch(baseUrl + file);
    assert.equal(response.status, 200, file);
    await response.arrayBuffer();
  }
});

test('keeps secrets, internal files and model backups private', async () => {
  for (const file of ['/.env', '/.env.example', '/.git/config', '/server.js', '/README.md',
    '/data/gloss-cache.json', '/output/testing/api-results.json', '/tmp/publication/check_submission.py',
    '/assets/character/translator-norig-backup.glb', '/js/%2e%2e/.env']) {
    const response = await fetch(baseUrl + file);
    assert.equal(response.status, 404, file);
    await response.arrayBuffer();
  }
});

test('HEAD returns headers without a body', async () => {
  const response = await fetch(baseUrl + '/live.html', { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
});

test('static files reject write methods', async () => {
  const response = await fetch(baseUrl + '/live.html', { method: 'POST' });
  assert.equal(response.status, 405);
});
