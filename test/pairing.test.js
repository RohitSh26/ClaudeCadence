// fork↔merge pairing logic (v1.9.8 → v1.9.10).
'use strict';
const { buildSandbox } = require('./helpers');

suite('hasMergeForToolUseId', () => {
  let nodes = [];
  const lib = buildSandbox(['hasMergeForToolUseId'], [], {
    loadNodes: () => nodes,
  });

  test('returns false when nodes empty', () => {
    nodes = [];
    assertEq(lib.hasMergeForToolUseId('sess', 'toolu_x'), false);
  });

  test('finds a merge with matching tuid in same session', () => {
    nodes = [{ session: 'sess', kind: 'merge', source_tool_use_id: 'toolu_aaa' }];
    assertEq(lib.hasMergeForToolUseId('sess', 'toolu_aaa'), true);
  });

  test('ignores a matching tuid in different session', () => {
    nodes = [{ session: 'other', kind: 'merge', source_tool_use_id: 'toolu_aaa' }];
    assertEq(lib.hasMergeForToolUseId('sess', 'toolu_aaa'), false);
  });

  test('ignores a fork with matching tuid (only merges count)', () => {
    nodes = [{ session: 'sess', kind: 'fork', source_tool_use_id: 'toolu_aaa' }];
    assertEq(lib.hasMergeForToolUseId('sess', 'toolu_aaa'), false);
  });

  test('null tuid returns false (safety)', () => {
    nodes = [{ session: 'sess', kind: 'merge', source_tool_use_id: null }];
    assertEq(lib.hasMergeForToolUseId('sess', null), false);
  });
});

suite('hasRecentPairedMergeForAgent', () => {
  let nodes = [];
  const lib = buildSandbox(['hasRecentPairedMergeForAgent'], [], {
    loadNodes: () => nodes,
  });
  const NOW = Date.parse('2026-05-11T17:02:10Z');
  const origDateNow = Date.now;
  Date.now = () => NOW;
  try {
    test('named subagent + recent paired merge → true', () => {
      nodes = [{
        session: 'sess', kind: 'merge', agent: 'backend-agent',
        source_tool_use_id: 'toolu_X', ts: '2026-05-11T17:01:56Z',
      }];
      assertEq(lib.hasRecentPairedMergeForAgent('sess', 'backend-agent', 600), true);
    });

    test('generic "subagent" name → never matches (always emits as noise)', () => {
      nodes = [{
        session: 'sess', kind: 'merge', agent: 'subagent',
        source_tool_use_id: 'toolu_X', ts: '2026-05-11T17:01:56Z',
      }];
      assertEq(lib.hasRecentPairedMergeForAgent('sess', 'subagent', 600), false);
    });

    test('outside time window → false', () => {
      nodes = [{
        session: 'sess', kind: 'merge', agent: 'backend-agent',
        source_tool_use_id: 'toolu_X', ts: '2026-05-11T16:00:00Z',
      }];
      assertEq(lib.hasRecentPairedMergeForAgent('sess', 'backend-agent', 600), false);
    });

    test('unpaired merge (no tuid) → does not count', () => {
      nodes = [{
        session: 'sess', kind: 'merge', agent: 'backend-agent',
        ts: '2026-05-11T17:01:56Z',
      }];
      assertEq(lib.hasRecentPairedMergeForAgent('sess', 'backend-agent', 600), false);
    });
  } finally {
    Date.now = origDateNow;
  }
});

suite('findUnpairedAgentToolUseId', () => {
  const path = require('path');
  const fs = require('fs');
  const os = require('os');

  let nodes = [];
  const lib = buildSandbox(['findUnpairedAgentToolUseId'], [], {
    loadNodes: () => nodes,
    fs,
  });

  function setupTranscript(lines) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadtest-'));
    const tr = path.join(dir, 't.jsonl');
    fs.writeFileSync(tr, lines.join('\n'));
    return tr;
  }
  const asstToolUse = (ts, name, id) => JSON.stringify({
    type: 'assistant', uuid: 'asst-' + id, timestamp: ts,
    message: { content: [{ type: 'tool_use', name, id, input: {} }] },
  });

  test('single Agent dispatch unpaired → returns id', () => {
    const tr = setupTranscript([asstToolUse('T1', 'Agent', 'toolu_aaa')]);
    nodes = [];
    assertEq(lib.findUnpairedAgentToolUseId(tr, 'sess'), 'toolu_aaa');
  });

  test('one paired, one unpaired → returns unpaired', () => {
    const tr = setupTranscript([
      asstToolUse('T1', 'Agent', 'toolu_aaa'),
      asstToolUse('T2', 'Agent', 'toolu_bbb'),
    ]);
    nodes = [{ session: 'sess', kind: 'merge', source_tool_use_id: 'toolu_aaa' }];
    assertEq(lib.findUnpairedAgentToolUseId(tr, 'sess'), 'toolu_bbb');
  });

  test('all paired → null', () => {
    const tr = setupTranscript([asstToolUse('T1', 'Agent', 'toolu_aaa')]);
    nodes = [{ session: 'sess', kind: 'merge', source_tool_use_id: 'toolu_aaa' }];
    assertEq(lib.findUnpairedAgentToolUseId(tr, 'sess'), null);
  });

  test('no Agent tool_uses → null', () => {
    const tr = setupTranscript([asstToolUse('T1', 'Bash', 'toolu_zzz')]);
    nodes = [];
    assertEq(lib.findUnpairedAgentToolUseId(tr, 'sess'), null);
  });

  test('Task tool name accepted (legacy alias)', () => {
    const tr = setupTranscript([asstToolUse('T1', 'Task', 'toolu_task')]);
    nodes = [];
    assertEq(lib.findUnpairedAgentToolUseId(tr, 'sess'), 'toolu_task');
  });

  test('reverse walk returns most recent unpaired', () => {
    const tr = setupTranscript([
      asstToolUse('T1', 'Agent', 'toolu_old'),
      asstToolUse('T2', 'Agent', 'toolu_new'),
    ]);
    nodes = [];
    assertEq(lib.findUnpairedAgentToolUseId(tr, 'sess'), 'toolu_new');
  });

  test('nonexistent transcript → null, no crash', () => {
    nodes = [];
    assertEq(lib.findUnpairedAgentToolUseId('/no/such/path', 'sess'), null);
  });
});
