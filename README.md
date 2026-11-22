# hebrew-arabic-guards

[![CI](https://github.com/123idog/hebrew-arabic-guards/actions/workflows/ci.yml/badge.svg)](https://github.com/123idog/hebrew-arabic-guards/actions/workflows/ci.yml)
![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)
![license: MIT](https://img.shields.io/badge/license-MIT-blue)

**Small, dependency-free guards for LLM output in Hebrew and Arabic.**

Run one check before your chatbot sends a reply, and it won't send a customer English that leaked into a Hebrew answer, internal instructions from the prompt, `???` from a broken encoding, or an unrendered `{{first_name}}`. Also included: whole-word matching that works in Arabic and Hebrew (JavaScript's `\b` doesn't), and name cleaning that keeps every script but drops emoji.

Every check here comes from a failure I saw in production chatbots.

---

## Install

```bash
npm install github:123idog/hebrew-arabic-guards
```

Node 18+. CommonJS, no dependencies, TypeScript types included.

---

## Before you send a reply

```js
const { checkReply } = require('hebrew-arabic-guards');

const result = checkReply(botReply, {
  language: 'hebrew',                       // or 'arabic'
  blocklist: ['handoff to agent', 'internal note'], // phrases from your prompt that must never reach a customer
});

if (!result.ok) {
  // don't send: retry once, or hand off to a human
  console.log(result.reasons); // e.g. ['latin_dominant']
}
```

| Reason | What it catches |
|---|---|
| `empty` | Nothing to send |
| `mojibake` | `???`, `�`, or Chinese/Japanese characters (Hebrew UTF-8 decoded with the wrong charset looks exactly like Chinese) |
| `template_residue` | Unrendered `{{name}}`, `${x}`, `[[x]]` |
| `wrong_script` | No Hebrew (or Arabic) letters at all |
| `latin_dominant` | More Latin letters than Hebrew/Arabic ones, i.e. English leaked into the reply. URLs and emails are ignored, so links and product names are fine |
| `prompt_leak` | A blocklisted phrase appears, even reworded with different punctuation, spacing, case or vowel marks |

### Why a ratio and not "contains Hebrew"?

A real leak looked like this: the model explained in English why it was ending the conversation, **quoting the customer's Hebrew message**. "Contains Hebrew" passes it. The ratio (about 11 Hebrew letters vs. 140 Latin ones) doesn't.

```js
checkReply('I am ending this conversation because the customer wrote "לא מעוניין תודה" ...');
// → { ok: false, reasons: ['latin_dominant'], ... }
```

`isSafeToSend(reply, options)` is the same check as a boolean.

---

## Whole-word matching in Arabic and Hebrew

```js
const { containsWord } = require('hebrew-arabic-guards');

containsWord('نبحث عن عمال للموسم', 'عمال');    // true   "looking for workers"
containsWord('عندي سؤال عن الأعمال', 'عمال');   // false  "business" contains the same letters
containsWord('طريقة الاستعمال', 'عمال');        // false  "usage" too

// Attached prefixes are opt-in
containsWord('والعمال هنا', 'عمال', { prefixes: 'arabic' });     // true  (و + ال)
containsWord('וכשהמחיר עולה', 'מחיר', { prefixes: 'hebrew' });  // true  (ו+כ+ש+ה)
```

The two naive approaches fail in opposite directions: `text.includes(word)` matches inside longer words, and `/\bword\b/` **never** matches, because `\b` only understands ASCII letters. `containsWord` anchors on any Unicode letter instead, and ignores nikud, harakat and tatweel on both sides.

This matters for keyword routing. In one case, a bare Arabic stem meaning "workers" routed real customers into a recruitment flow because it matched inside ordinary words.

---

## Cleaning names

```js
const { cleanName, pickName } = require('hebrew-arabic-guards');

cleanName('🌴 Abu Omar 😎');  // 'Abu Omar'
cleanName('יוֹסֵף');           // 'יוֹסֵף'   nikud kept
cleanName('أحمـــد');          // 'أحمد'    tatweel removed
cleanName('ז׳קלין');           // 'ז׳קלין'  geresh kept
cleanName('😍😍😍');           // null     nothing usable, so fall back

// First usable name, in priority order
pickName([nameFromModel, nameInMessage, storedName]); // never the messaging-app profile name
```

Names over 4 words or 40 characters return `null`. They're usually a business name or a slogan, not a person. Both limits are configurable.

---

## Other helpers

- `detectScript(text)` counts Hebrew, Arabic, Latin and CJK letters and returns the dominant script. Use three scripts, not two: Arabic text is "not Hebrew", but it isn't English either.
- `normalize(text)` strips vowel marks and tatweel, unifies Arabic alef/yeh forms, lowercases, drops punctuation and collapses whitespace.
- `findPromptLeaks(reply, phrases)` lists which blocklisted phrases matched.

---

## Using it in an n8n Code node

See [`examples/n8n-code-node.js`](examples/n8n-code-node.js). The library is a single file with no dependencies, so it can be pasted straight into a Code node.

---

## Tests

```bash
npm test
```

The tests use Node's built-in runner and cover every case above. All test data is invented.

---

## Author

**Ido Guy**, AI & Automation Engineer. I design end-to-end AI solutions for sales and operations teams, including AI that runs in Hebrew and Arabic. [LinkedIn](https://www.linkedin.com/in/ido-guy)

MIT License.
