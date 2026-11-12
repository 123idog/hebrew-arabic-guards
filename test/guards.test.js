'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../src/index.js');

// All examples are invented.

test('detectScript counts three scripts, not two', () => {
  assert.equal(g.detectScript('שלום, מה שלומך?').dominant, 'hebrew');
  assert.equal(g.detectScript('مرحبا، كيف حالك؟').dominant, 'arabic');
  assert.equal(g.detectScript('Hello there').dominant, 'latin');
  // An Arabic text is "not Hebrew", but that does not make it English.
  const ar = g.detectScript('أهلاً وسهلاً بك');
  assert.equal(ar.hebrew, 0);
  assert.equal(ar.latin, 0);
  assert.ok(ar.arabic > 0);
  assert.equal(g.detectScript('').dominant, 'none');
});

test('normalize strips nikud, harakat and tatweel, unifies alef', () => {
  assert.equal(g.normalize('שָׁלוֹם'), 'שלום');
  assert.equal(g.normalize('مَرْحَبًا'), 'مرحبا');
  assert.equal(g.normalize('جمـــيل'), 'جميل');
  assert.equal(g.normalize('أحمد'), g.normalize('احمد'));
  assert.equal(g.normalize('  Hello,   WORLD! '), 'hello world');
});

test('containsWord: Arabic stem is not matched inside longer words', () => {
  const workers = 'عمال'; // "workers"
  assert.equal(g.containsWord('نبحث عن عمال للموسم', workers), true);
  assert.equal(g.containsWord('عندي سؤال عن الأعمال', workers), false); // "business"
  assert.equal(g.containsWord('طريقة الاستعمال', workers), false); // "usage"
  // The two naive approaches fail in opposite directions:
  assert.equal('عندي سؤال عن الأعمال'.includes(workers), true, 'substring matches inside "business"');
  assert.equal(/\bعمال\b/u.test('نبحث عن عمال للموسم'), false, 'JS \\b never matches an Arabic word');
});

test('containsWord: optional attached prefixes', () => {
  assert.equal(g.containsWord('والعمال هنا', 'عمال'), false);
  assert.equal(g.containsWord('والعمال هنا', 'عمال', { prefixes: 'arabic' }), true);
  assert.equal(g.containsWord('וכשהמחיר עולה', 'מחיר'), false);
  assert.equal(g.containsWord('וכשהמחיר עולה', 'מחיר', { prefixes: 'hebrew' }), true);
  assert.equal(g.containsWord('price list', 'price'), true);
  assert.equal(g.containsWord('pricelist', 'price'), false);
  assert.equal(g.containsWord('anything', ''), false);
});

test('containsWord ignores diacritics on both sides', () => {
  assert.equal(g.containsWord('הַמְּחִיר הוא', 'מחיר', { prefixes: 'hebrew' }), true);
  assert.equal(g.containsWord('شُكْرًا لَك', 'شكرا'), true);
});

const BLOCKLIST = ['handoff to agent', 'אל תציג ללקוח', 'internal note'];

test('findPromptLeaks catches loosely reworded leaks', () => {
  assert.deepEqual(g.findPromptLeaks('מעולה! [אל תציג, ללקוח] נחזור אליך', BLOCKLIST), ['אל תציג ללקוח']);
  assert.deepEqual(g.findPromptLeaks('...HANDOFF   to-agent', BLOCKLIST), ['handoff to agent']);
  assert.equal(g.hasPromptLeak('תודה רבה, נחזור אליך בהקדם', BLOCKLIST), false);
  // a phrase must match on word boundaries, not inside other words
  assert.equal(g.hasPromptLeak('international notes', ['internal note']), false);
  assert.equal(g.hasPromptLeak('anything', undefined), false);
});

test('checkReply: a normal Hebrew reply passes', () => {
  const r = g.checkReply('היי! המחיר לזוג הוא 1,200 ₪, כולל ארוחת בוקר. רוצה שאשלח פרטים?');
  assert.deepEqual(r.reasons, []);
  assert.equal(r.ok, true);
});

test('checkReply: Latin product names and links are fine', () => {
  const r = g.checkReply('הנה הקישור להזמנה: https://example.com/booking?id=abc123 — אפשר לשלם ב-Visa או ב-PayPal');
  assert.equal(r.ok, true, r.reasons.join(','));
});

test('checkReply: English leak that quotes the customer is caught', () => {
  // "contains Hebrew" would pass this. The ratio does not.
  const leak =
    'I am ending this conversation because the customer wrote "לא מעוניין תודה" and ' +
    'according to my instructions I should not continue after a refusal.';
  const r = g.checkReply(leak);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes('latin_dominant'));
});

test('checkReply: wrong language entirely', () => {
  assert.deepEqual(g.checkReply('Sure, here are the details.').reasons, ['wrong_script']);
  assert.deepEqual(g.checkReply('שלום', { language: 'arabic' }).reasons, ['wrong_script']);
});

test('checkReply: Arabic reply passes with language=arabic', () => {
  const r = g.checkReply('أهلاً! السعر للعائلة ٣٠٠ دولار. هل تريد التفاصيل؟', { language: 'arabic' });
  assert.equal(r.ok, true, r.reasons.join(','));
});

test('checkReply: mojibake signatures', () => {
  assert.ok(g.checkReply('??? ???? ?????').reasons.includes('mojibake'));
  assert.ok(g.checkReply('שלום ��').reasons.includes('mojibake'));
  // Hebrew UTF-8 decoded as GBK shows up as Chinese characters
  assert.ok(g.checkReply('המחיר 噴脳 讗谞').reasons.includes('mojibake'));
});

test('checkReply: unrendered template placeholders', () => {
  assert.ok(g.checkReply('היי {{first_name}}, מה שלומך?').reasons.includes('template_residue'));
  assert.ok(g.checkReply('היי ${name}').reasons.includes('template_residue'));
});

test('checkReply: prompt leak with blocklist', () => {
  const r = g.checkReply('בשמחה! internal note: הלקוח לחוץ', { blocklist: BLOCKLIST });
  assert.deepEqual(r.reasons, ['prompt_leak']);
});

test('checkReply: empty', () => {
  assert.deepEqual(g.checkReply('   ').reasons, ['empty']);
  assert.deepEqual(g.checkReply(null).reasons, ['empty']);
});

test('isSafeToSend is the boolean shorthand', () => {
  assert.equal(g.isSafeToSend('תודה רבה!'), true);
  assert.equal(g.isSafeToSend('Thanks!'), false);
});

test('cleanName keeps names in any script and drops emoji', () => {
  assert.equal(g.cleanName('🌴 Abu Omar 😎'), 'Abu Omar');
  assert.equal(g.cleanName('محمّد'), 'محمّد'); // shadda kept
  assert.equal(g.cleanName('יוֹסֵף'), 'יוֹסֵף'); // nikud kept
  assert.equal(g.cleanName("D'Angelo"), "D'Angelo");
  assert.equal(g.cleanName('בן-חיים'), 'בן-חיים');
  assert.equal(g.cleanName('ז׳קלין'), 'ז׳קלין'); // Hebrew geresh
  assert.equal(g.cleanName('أحمـــد'), 'أحمد'); // tatweel removed
});

test('cleanName returns null when nothing usable remains', () => {
  assert.equal(g.cleanName('😍😍😍'), null);
  assert.equal(g.cleanName('#1 Best Deals Travel Shop Official Account'), null); // too many words
  assert.equal(g.cleanName('0501234567'), null);
  assert.equal(g.cleanName(''), null);
  assert.equal(g.cleanName(undefined), null);
  assert.equal(g.cleanName(' - '), null);
});

test('pickName falls back in priority order', () => {
  assert.equal(g.pickName([null, '🙂', 'שירה כהן', 'Shira']), 'שירה כהן');
  assert.equal(g.pickName(['', '***']), null);
});
