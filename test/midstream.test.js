// Mid-stream interrupt — v2.3 upperBound parameter on firstAssistantTextAfter.
// When the user submits prompt #2 while Claude is still responding to prompt
// #1, the response for #1 must STOP at #2's UPS ts even if #2's user entry
// hasn't been physically flushed to the transcript yet.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { buildSandbox } = require('./helpers');

const lib = buildSandbox(
  ['firstAssistantTextAfter', 'extractAssistantText', 'isToolResultEntry'],
  [],
  { fs }
);

function tmpTranscript(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadtest-mid-'));
  const tr = path.join(dir, 't.jsonl');
  fs.writeFileSync(tr, entries.map(e => JSON.stringify(e)).join('\n'));
  return tr;
}
const asstText = (ts, text) => ({
  type: 'assistant', timestamp: ts,
  message: { content: [{ type: 'text', text }] },
});
const userText = (ts, text) => ({
  type: 'user', timestamp: ts,
  message: { content: text },
});

suite('firstAssistantTextAfter — upperBound', () => {
  test('no upperBound: collects across the whole tail', () => {
    const tr = tmpTranscript([
      asstText('2026-05-12T10:00:01Z', 'chunk-1'),
      asstText('2026-05-12T10:00:02Z', 'chunk-2'),
      asstText('2026-05-12T10:00:03Z', 'chunk-3'),
    ]);
    const got = lib.firstAssistantTextAfter(tr, null);
    assertEq(got.text, 'chunk-1\nchunk-2\nchunk-3');
  });

  test('upperBound caps collection BEFORE the boundary ts', () => {
    const tr = tmpTranscript([
      asstText('2026-05-12T10:00:01Z', 'turn1-chunk-A'),
      asstText('2026-05-12T10:00:02Z', 'turn1-chunk-B'),
      // user-2 hasn't been written yet — but we know its UPS ts from the queue
      asstText('2026-05-12T10:00:04Z', 'turn2-chunk-X'),
      asstText('2026-05-12T10:00:05Z', 'turn2-chunk-Y'),
    ]);
    const got = lib.firstAssistantTextAfter(tr, null, '2026-05-12T10:00:03Z');
    assertEq(got.text, 'turn1-chunk-A\nturn1-chunk-B');
  });

  test('upperBound stops even when user-2 entry IS present', () => {
    const tr = tmpTranscript([
      asstText('2026-05-12T10:00:01Z', 'turn1-A'),
      userText('2026-05-12T10:00:03Z', 'prompt #2'),
      asstText('2026-05-12T10:00:04Z', 'turn2-X'),
    ]);
    const got = lib.firstAssistantTextAfter(tr, null, '2026-05-12T10:00:03Z');
    assertEq(got.text, 'turn1-A');
  });

  test('upperBound at exact ts excludes that entry (>= boundary)', () => {
    const tr = tmpTranscript([
      asstText('2026-05-12T10:00:01Z', 'before'),
      asstText('2026-05-12T10:00:02Z', 'at-boundary'),
    ]);
    const got = lib.firstAssistantTextAfter(tr, null, '2026-05-12T10:00:02Z');
    assertEq(got.text, 'before');
  });

  test('no upperBound, user-prompt boundary still works (regression)', () => {
    const tr = tmpTranscript([
      asstText('2026-05-12T10:00:01Z', 'turn1'),
      userText('2026-05-12T10:00:02Z', 'real user msg'),
      asstText('2026-05-12T10:00:03Z', 'turn2'),
    ]);
    const got = lib.firstAssistantTextAfter(tr, null);
    assertEq(got.text, 'turn1');
  });

  test('cursor + upperBound: collects only the middle slice', () => {
    const tr = tmpTranscript([
      asstText('2026-05-12T10:00:01Z', 'old-turn'),
      asstText('2026-05-12T10:00:05Z', 'this-turn-A'),
      asstText('2026-05-12T10:00:06Z', 'this-turn-B'),
      asstText('2026-05-12T10:00:09Z', 'next-turn'),
    ]);
    const got = lib.firstAssistantTextAfter(
      tr,
      '2026-05-12T10:00:04Z',
      '2026-05-12T10:00:08Z',
    );
    assertEq(got.text, 'this-turn-A\nthis-turn-B');
  });
});
