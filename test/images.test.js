// Image attachment extraction (v2.6) — extractAttachedImages reads the
// transcript backwards to find the most recent user message whose content
// array carries image blocks, then returns the (media_type, data) pairs
// for the hook to persist.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { buildSandbox } = require('./helpers');

const lib = buildSandbox(
  ['extractAttachedImages'],
  ['IMG_MAX_BYTES', 'IMG_MAX_COUNT', 'IMG_LOOKBACK'],
  { fs }
);

function tmpTranscript(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadtest-img-'));
  const p = path.join(dir, 't.jsonl');
  fs.writeFileSync(p, entries.map(e => JSON.stringify(e)).join('\n'));
  return p;
}
const userWithImages = (...imgs) => ({
  type: 'user',
  message: {
    content: imgs.map(i => ({
      type: 'image',
      source: { type: 'base64', media_type: i.mt || 'image/png', data: i.data || 'AAAA' },
    })),
  },
});
const userText = (s) => ({ type: 'user', message: { content: s } });
const asst = (text) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } });

suite('extractAttachedImages', () => {
  test('returns [] when transcript missing', () => {
    assertEq(lib.extractAttachedImages('/no/such/file').length, 0);
  });

  test('returns [] when no user-msg has images', () => {
    const p = tmpTranscript([userText('hi'), asst('hello'), userText('still text')]);
    assertEq(lib.extractAttachedImages(p).length, 0);
  });

  test('returns latest user-msg images (array content)', () => {
    const p = tmpTranscript([
      userText('first'),
      userWithImages({ data: 'AAA' }, { data: 'BBB' }),
      asst('response'),
    ]);
    const got = lib.extractAttachedImages(p);
    assertEq(got.length, 2);
    assertEq(got[0].data, 'AAA');
    assertEq(got[1].data, 'BBB');
  });

  test('caps at 5 images per turn', () => {
    const imgs = Array.from({ length: 8 }, (_, i) => ({ data: 'IMG' + i }));
    const p = tmpTranscript([userWithImages(...imgs)]);
    assertEq(lib.extractAttachedImages(p).length, 5);
  });

  test('skips oversized images (> 5 MB base64)', () => {
    const big = { data: 'A'.repeat(6 * 1024 * 1024) };
    const small = { data: 'AAAA' };
    const p = tmpTranscript([userWithImages(big, small)]);
    const got = lib.extractAttachedImages(p);
    assertEq(got.length, 1);
    assertEq(got[0].data, 'AAAA');
  });

  test('default media_type when missing', () => {
    const p = tmpTranscript([{
      type: 'user',
      message: { content: [{ type: 'image', source: { type: 'base64', data: 'AAAA' } }] },
    }]);
    assertEq(lib.extractAttachedImages(p)[0].media_type, 'image/png');
  });

  test('honors lookback window — old image not returned when newer user-msg has no images', () => {
    const entries = [userWithImages({ data: 'OLD' })];
    // Push 90 plain entries on top so the image falls outside lookback
    for (let i = 0; i < 90; i++) entries.push(userText('x'));
    const p = tmpTranscript(entries);
    assertEq(lib.extractAttachedImages(p).length, 0);
  });
});
