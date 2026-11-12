'use strict';

/**
 * hebrew-arabic-guards
 * Small, dependency-free guards for LLM output in Hebrew and Arabic.
 */

const RE_HEBREW = /[א-תװ-ײיִ-ﭏ]/gu;
const RE_ARABIC = /[ؠ-يٱ-ۓۺ-ۼݐ-ݿﭐ-﷿ﹰ-﻿]/gu;
const RE_LATIN = /[A-Za-zÀ-ɏ]/gu;
const RE_CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/gu;

// Hebrew points (nikud, cantillation) and Arabic harakat / tatweel.
const RE_HEBREW_MARKS = /[֑-ׇ]/gu;
const RE_ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/gu;

const RE_URL = /\bhttps?:\/\/\S+|\bwww\.\S+/giu;
const RE_EMAIL = /\S+@\S+\.\S+/gu;

const LETTER = '\\p{L}\\p{M}\\p{N}';

function count(text, re) {
  const m = String(text).match(re);
  return m ? m.length : 0;
}

/**
 * Count letters per script and return the dominant one.
 * @param {string} text
 * @returns {{hebrew:number, arabic:number, latin:number, cjk:number, dominant:'hebrew'|'arabic'|'latin'|'cjk'|'none'}}
 */
function detectScript(text) {
  const s = String(text ?? '');
  const counts = {
    hebrew: count(s, RE_HEBREW),
    arabic: count(s, RE_ARABIC),
    latin: count(s, RE_LATIN),
    cjk: count(s, RE_CJK),
  };
  let dominant = 'none';
  let max = 0;
  for (const k of ['hebrew', 'arabic', 'latin', 'cjk']) {
    if (counts[k] > max) {
      max = counts[k];
      dominant = k;
    }
  }
  return { ...counts, dominant };
}

/**
 * Normalise text for matching: strip Hebrew nikud and Arabic harakat/tatweel,
 * unify Arabic alef/yeh variants, lowercase Latin, drop punctuation, collapse spaces.
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(RE_HEBREW_MARKS, '')
    .replace(RE_ARABIC_MARKS, '')
    .replace(/[آأإٱ]/gu, 'ا') // آ أ إ ٱ -> ا
    .replace(/ى/gu, 'ي') // ى -> ي
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Optional attached prefixes.
// Hebrew: ו ה ב ל מ ש כ (up to 4, e.g. "וכשה").
// Arabic: و/ف + ب/ل/ك + ال (e.g. "وبال").
const PREFIX = {
  hebrew: '(?:[והבלמשכ]{1,4})?',
  arabic: '(?:[وف])?(?:[بلك])?(?:ال)?',
};

/**
 * Match a whole word in Hebrew, Arabic or Latin text.
 * JavaScript's \b only understands ASCII word characters, so it fails on Arabic and Hebrew.
 * This anchors on any Unicode letter/mark/digit instead.
 *
 * @param {string} text
 * @param {string} word
 * @param {{prefixes?: 'hebrew'|'arabic'|false}} [options]
 * @returns {boolean}
 */
function containsWord(text, word, options = {}) {
  const t = normalize(text);
  const w = normalize(word);
  if (!w) return false;
  const prefix = options.prefixes ? PREFIX[options.prefixes] || '' : '';
  const re = new RegExp(`(?<![${LETTER}])${prefix}${escapeRegExp(w)}(?![${LETTER}])`, 'u');
  return re.test(t);
}

/**
 * Does the reply contain any internal phrase (prompt instructions, control tags, meta talk)?
 * Matching is loose: case, punctuation, spacing and diacritics are ignored,
 * so a slightly reworded leak is still caught.
 *
 * @param {string} reply
 * @param {string[]} phrases
 * @returns {string[]} the phrases that matched (empty if none)
 */
function findPromptLeaks(reply, phrases) {
  const r = ` ${normalize(reply)} `;
  return (phrases || []).filter((p) => {
    const n = normalize(p);
    return n && r.includes(` ${n} `);
  });
}

/**
 * @param {string} reply
 * @param {string[]} phrases
 * @returns {boolean}
 */
function hasPromptLeak(reply, phrases) {
  return findPromptLeaks(reply, phrases).length > 0;
}

/**
 * Decide whether an LLM reply is safe to send to a Hebrew- or Arabic-speaking customer.
 *
 * Checks, in order:
 *  - empty            nothing to send
 *  - mojibake         replacement chars, runs of "???", or CJK characters (a classic
 *                     symptom of UTF-8 Hebrew decoded with the wrong charset)
 *  - template_residue unrendered placeholders like {{name}} or ${x}
 *  - wrong_script     no letters at all in the expected script
 *  - latin_dominant   more Latin letters than expected-script letters (after URLs and
 *                     emails are removed), i.e. English leaked into the reply
 *  - prompt_leak      an internal phrase from `blocklist` appears in the reply
 *
 * @param {string} reply
 * @param {{language?: 'hebrew'|'arabic', blocklist?: string[], maxLatinRatio?: number}} [options]
 * @returns {{ok: boolean, reasons: string[], script: ReturnType<typeof detectScript>}}
 */
function checkReply(reply, options = {}) {
  const language = options.language || 'hebrew';
  const maxLatinRatio = options.maxLatinRatio ?? 1;
  const text = String(reply ?? '');
  const reasons = [];

  const stripped = text.replace(RE_URL, ' ').replace(RE_EMAIL, ' ');
  const script = detectScript(stripped);

  if (!text.trim()) {
    return { ok: false, reasons: ['empty'], script };
  }
  if (/�/u.test(text) || /\?{3,}/u.test(text) || script.cjk > 0) {
    reasons.push('mojibake');
  }
  if (/\{\{[^}]*\}\}|\$\{[^}]*\}|\[\[[^\]]*\]\]/u.test(text)) {
    reasons.push('template_residue');
  }
  const expected = script[language];
  if (expected === 0) {
    reasons.push('wrong_script');
  } else if (script.latin > expected * maxLatinRatio) {
    reasons.push('latin_dominant');
  }
  if (hasPromptLeak(text, options.blocklist)) {
    reasons.push('prompt_leak');
  }
  return { ok: reasons.length === 0, reasons, script };
}

/**
 * Shorthand for checkReply(...).ok
 * @param {string} reply
 * @param {Parameters<typeof checkReply>[1]} [options]
 * @returns {boolean}
 */
function isSafeToSend(reply, options) {
  return checkReply(reply, options).ok;
}

/**
 * Clean a person's name for a CRM or a greeting.
 * Keeps letters and combining marks in any script (Hebrew with nikud, Arabic with harakat,
 * accented Latin), spaces, apostrophes and hyphens. Drops emoji, digits and symbols.
 * Returns null when nothing usable is left, so the caller can fall back.
 *
 * @param {string} name
 * @param {{maxWords?: number, maxLength?: number}} [options]
 * @returns {string|null}
 */
function cleanName(name, options = {}) {
  const maxWords = options.maxWords ?? 4;
  const maxLength = options.maxLength ?? 40;
  const cleaned = String(name ?? '')
    .normalize('NFC')
    .replace(/ـ/gu, '') // tatweel
    .replace(/[^\p{L}\p{M}\s'׳’-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/(^|\s)['׳’-]+|['׳’-]+(?=\s|$)/gu, '$1')
    .trim();
  if (!cleaned || !/\p{L}/u.test(cleaned)) return null;
  const words = cleaned.split(' ');
  if (words.length > maxWords || cleaned.length > maxLength) return null;
  return cleaned;
}

/**
 * Pick the first usable name from a list of candidates, in priority order.
 * Typical order: name extracted by the model → name stated in the message → stored name.
 * (Never the messaging-app profile name: it is often an emoji, a nickname or a business.)
 *
 * @param {Array<string|null|undefined>} candidates
 * @param {Parameters<typeof cleanName>[1]} [options]
 * @returns {string|null}
 */
function pickName(candidates, options) {
  for (const c of candidates || []) {
    const n = cleanName(c, options);
    if (n) return n;
  }
  return null;
}

module.exports = {
  detectScript,
  normalize,
  containsWord,
  findPromptLeaks,
  hasPromptLeak,
  checkReply,
  isSafeToSend,
  cleanName,
  pickName,
};
