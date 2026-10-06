const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mock = 'data:text/javascript,' + encodeURIComponent('export async function apiResolve(){return {key:false};} export function apiCurrent(){return {name:"none"};} export async function apiRequest(){throw new Error("offline");}');
const source = fs.readFileSync(path.join(__dirname, '../js/live/translate.js'), 'utf8').replace('"./api.js"', JSON.stringify(mock));
const loaded = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('negative speech cannot fall back to an affirmative sign sequence', async () => {
  const { Translator } = await loaded;
  const translator = new Translator();
  await translator.init();
  // negation is signed explicitly: the negated word, then the NEGATION sign
  const neg = await translator.translate('لا تصلوا');
  const salah = neg.findIndex(item => item.id === 'GLOSS_SALAH');
  assert.ok(salah >= 0, 'the negated word is signed');
  assert.equal(neg[salah + 1]?.id, 'GLOSS_NEG', 'immediately followed by the negation sign');
  assert.equal(translator.lastSource, 'negation');
  assert.ok(translator.warning);
  // never an affirmative-only sequence
  assert.ok(!(await translator.translate('صلوا')).some(item => item.id === 'GLOSS_NEG'));
  assert.ok((await translator.translate('صلوا')).some(item => item.id === 'GLOSS_SALAH'));
});

test('a negated word that cannot be signed sends the sentence back to review (text only)', async () => {
  const { Translator } = await loaded;
  const translator = new Translator();
  await translator.init();
  assert.deepEqual(await translator.translate('لا لا'), []);
  assert.equal(translator.lastSource, 'review');
});

test('the creed formula is not treated as a negated action', async () => {
  const { needsNegationReview } = await loaded;
  assert.equal(needsNegationReview('أشهد أن لا إله إلا الله وحده لا شريك له'), false);
});

test('common Arabic negation variants require review but positive phrases remain usable', async () => {
  const { needsNegationReview } = await loaded;
  for (const text of ['لا تؤذوا الناس', 'ولا تظلموا أحداً', 'لَنْ نفعل', 'لم يعمل', 'ليس سواء']) {
    assert.equal(needsNegationReview(text), true, text);
  }
  assert.equal(needsNegationReview('اتقوا الله وأحسنوا إلى الناس'), false);
});
