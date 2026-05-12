// simpleMd + GFM pipe tables (v2.1.1 fix).
'use strict';
const fs = require('fs');
const path = require('path');

const TL_PATH = path.join(__dirname, '..', 'plugins', 'claudecadence', 'viewer', '_timeline.js');
const src = fs.readFileSync(TL_PATH, 'utf8');

// _timeline.js uses 2-space indented `function NAME` blocks inside an IIFE.
function extractFunc(name) {
  const re = new RegExp('^  function ' + name + '[\\s\\S]*?\\n  \\}\\n', 'm');
  const m = src.match(re);
  if (!m) throw new Error('not found: ' + name);
  return m[0];
}

const code = [
  extractFunc('escapeHtml'),
  extractFunc('safeHref'),
  extractFunc('inlineMd'),
  extractFunc('parsePipeTable'),
].join('\n\n');
const lib = new Function(code + '\nreturn { parsePipeTable };')();

suite('parsePipeTable', () => {
  test('basic 3-column GFM table', () => {
    const t = [
      '| A | B | C |',
      '|---|---|---|',
      '| 1 | 2 | 3 |',
    ];
    const r = lib.parsePipeTable(t, 0);
    assert(r, 'should parse');
    assertEq(r.consumed, 3);
    assertMatch(r.html, /<table>.*<thead>.*<th>A<\/th>.*<th>B<\/th>.*<th>C<\/th>/s);
    assertMatch(r.html, /<tbody>.*<td>1<\/td>.*<td>2<\/td>.*<td>3<\/td>/s);
  });

  test('alignment markers (left / right / center)', () => {
    const t = ['| L | R | C |', '|:---|---:|:---:|', '| a | b | c |'];
    const r = lib.parsePipeTable(t, 0);
    assertMatch(r.html, /text-align:left/);
    assertMatch(r.html, /text-align:right/);
    assertMatch(r.html, /text-align:center/);
  });

  test('escaped \\| in cell preserved', () => {
    const t = ['| K | V |', '|---|---|', '| or | a \\| b |'];
    const r = lib.parsePipeTable(t, 0);
    assertMatch(r.html, /a \| b/);
  });

  test('non-table content → null', () => {
    const t = ['just a paragraph', 'with | a pipe', 'no separator'];
    assertEq(lib.parsePipeTable(t, 0), null);
  });

  test('table without leading/trailing pipes still parses', () => {
    const t = ['A | B', '--|--', '1 | 2'];
    const r = lib.parsePipeTable(t, 0);
    assert(r, 'should parse');
  });

  test('header column count must match separator', () => {
    const t = ['| A | B | C |', '|---|---|', '| 1 | 2 | 3 |'];
    assertEq(lib.parsePipeTable(t, 0), null);
  });
});
