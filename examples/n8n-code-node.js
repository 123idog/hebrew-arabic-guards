// Example: an n8n Code node ("Run Once for Each Item") placed between the LLM and the send step.
// Paste the contents of src/index.js above this block (minus `module.exports`), or load it
// via NODE_FUNCTION_ALLOW_EXTERNAL if your instance allows external modules.

const reply = $json.reply; // the LLM's answer

const result = checkReply(reply, {
  language: 'hebrew',
  blocklist: ['handoff to agent', 'internal note'],
});

return {
  json: {
    ...$json,
    safeToSend: result.ok,
    guardReasons: result.reasons, // log these: a rising rate means the model or prompt is degrading
  },
};

// Next: an IF node on `safeToSend`.
//   true  → send
//   false → retry once with a stricter instruction, then hand off to a human
