const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mockApi = 'data:text/javascript,' + encodeURIComponent('export async function apiRequest(kind, options) { return globalThis.asrRequest(kind, options); } export async function apiResolve() { return {key:true,asr:"test"}; }');
const source = fs.readFileSync(path.join(__dirname, '../js/live/asr.js'), 'utf8').replace('"./api.js"', JSON.stringify(mockApi));
const loaded = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const turn = () => new Promise(resolve => setImmediate(resolve));

function active(Adapter, onText, onState = () => {}) {
  const adapter = new Adapter({ onText, onState });
  Object.assign(adapter, { _live: true, _session: 1, _queued: 0, _pending: Promise.resolve() });
  return adapter;
}

test('quiet recordings have no speech and are never classified by byte size', async () => {
  const { SpeechWindow } = await loaded;
  const segment = new SpeechWindow();
  for (let ms = 100; ms <= 9900; ms += 100) assert.equal(segment.sample(0.001, ms), false);
  assert.equal(segment.sample(0.001, 10000), true);
  assert.equal(segment.hasSpeech, false);
});

test('speech ends at a pause rather than a fixed three-second cut', async () => {
  const { SpeechWindow } = await loaded;
  const segment = new SpeechWindow();
  for (let ms = 100; ms <= 3500; ms += 100) assert.equal(segment.sample(0.04, ms), false);
  assert.equal(segment.sample(0, 4000), false);
  assert.equal(segment.sample(0, 4200), true);
  assert.equal(segment.hasSpeech, true);
});

test('a brief click does not qualify as speech', async () => {
  const { SpeechWindow } = await loaded;
  const segment = new SpeechWindow();
  segment.sample(0.2, 100);
  segment.sample(0.2, 200);
  segment.sample(0, 1600);
  assert.equal(segment.hasSpeech, false);
});

test('the adaptive floor never climbs high enough to swallow real speech', async () => {
  const { SpeechWindow } = await loaded;
  const segment = new SpeechWindow();
  for (let ms = 100; ms <= 3000; ms += 100) segment.sample(0.012, ms);   // loud-ish room
  assert.ok(segment._on <= 0.022, 'on-threshold is capped');
  for (let ms = 3100; ms <= 4000; ms += 100) segment.sample(0.05, ms);   // real speech
  assert.equal(segment.hasSpeech, true);
});

test('quiet speech above the learned floor still registers', async () => {
  const { SpeechWindow } = await loaded;
  const segment = new SpeechWindow({ floor: 0.002 });
  for (let ms = 100; ms <= 1500; ms += 100) segment.sample(0.009, ms);   // soft voice
  assert.equal(segment.hasSpeech, true);
});

test('filler filter only rejects whole-utterance filler, not mentions', async () => {
  const { isHallucination } = await loaded;
  assert.equal(isHallucination('اشتركوا في القناة', { speechMs: 2000, durMs: 3000 }), true);
  assert.equal(isHallucination('يتحدث الإمام عن الموسيقى في المجتمع وحكمها عند أهل العلم', { speechMs: 3000, durMs: 4000 }), false);
  assert.equal(isHallucination('موسيقى', {}), true);
  assert.equal(isHallucination('قصير', { speechMs: 800, durMs: 5500 }), false);
  assert.equal(isHallucination('شيء', { speechMs: 200, durMs: 5000 }), true);
});

test('ASR requests and downstream translations finish in captured order', async () => {
  const { WhisperChunkAdapter } = await loaded;
  let completeFirst;
  const calls = [], output = [];
  global.asrRequest = async (kind, options) => {
    calls.push(options.body);
    if (calls.length === 1) await new Promise(resolve => completeFirst = resolve);
    return { text: String(options.body) };
  };
  const adapter = active(WhisperChunkAdapter, text => output.push(text));
  adapter._enqueue('first', 1);
  adapter._enqueue('second', 1);
  await turn();
  assert.deepEqual(calls, ['first']);
  completeFirst();
  await adapter._pending;
  assert.deepEqual(output, ['first', 'second']);
  adapter.stop();
});

test('stopping aborts the current request and discards old queued callbacks', async () => {
  const { WhisperChunkAdapter } = await loaded;
  let complete, signal;
  const output = [];
  global.asrRequest = async (kind, options) => {
    signal = options.signal;
    await new Promise(resolve => complete = resolve);
    return { text: 'old session' };
  };
  const adapter = active(WhisperChunkAdapter, text => output.push(text));
  adapter._enqueue('first', 1);
  adapter._enqueue('second', 1);
  await turn();
  adapter.stop();
  assert.equal(signal.aborted, true);
  complete();
  await adapter._pending;
  assert.deepEqual(output, []);
});
