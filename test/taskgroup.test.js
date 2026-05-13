// Task-notification grouping (v2.4) — system-injection guard +
// upsertTaskGroup folds N notifications by task-id into one node.
'use strict';
const { buildSandbox } = require('./helpers');

const lib = buildSandbox(
  ['isSystemInjectionText', 'extractTaskId', 'extractTaskNotice'],
  ['SYSTEM_INJECTION_RE', 'TASK_NOTIFICATION_HEAD_RE']
);

suite('isSystemInjectionText', () => {
  test('task-notification → true', () => {
    assertEq(lib.isSystemInjectionText('<task-notification><task-id>abc</task-id></task-notification>'), true);
  });
  test('autonomous-loop → true', () => {
    assertEq(lib.isSystemInjectionText('<<autonomous-loop-dynamic>'), true);
  });
  test('command-name → true', () => {
    assertEq(lib.isSystemInjectionText('<command-name>/model</command-name>'), true);
  });
  test('system-reminder → true', () => {
    assertEq(lib.isSystemInjectionText('<system-reminder>note</system-reminder>'), true);
  });
  test('plain user prompt → false', () => {
    assertEq(lib.isSystemInjectionText('Deploy the orders csv export'), false);
  });
  test('leading whitespace then injection → still true', () => {
    assertEq(lib.isSystemInjectionText('   <task-notification>x</task-notification>'), true);
  });
  test('curl command with angle bracket → false', () => {
    assertEq(lib.isSystemInjectionText('curl https://api.example.com | jq'), false);
  });
});

suite('extractTaskId', () => {
  test('single id', () => {
    assertEq(lib.extractTaskId('<task-notification><task-id>bxyz123</task-id></task-notification>'), 'bxyz123');
  });
  test('id with hyphens / underscores', () => {
    assertEq(lib.extractTaskId('<task-id>build_bg-42</task-id>'), 'build_bg-42');
  });
  test('no id present → null', () => {
    assertEq(lib.extractTaskId('<task-notification>orphan</task-notification>'), null);
  });
  test('empty input → null', () => {
    assertEq(lib.extractTaskId(''), null);
  });
});

suite('extractTaskNotice', () => {
  test('status tag wins', () => {
    const n = lib.extractTaskNotice('<task-notification><status>running · 6231/10000</status></task-notification>');
    assertEq(n.status, 'running · 6231/10000');
  });
  test('falls back to first non-tag line', () => {
    const n = lib.extractTaskNotice('<task-notification>processing batch 7 of 12</task-notification>');
    assertEq(n.status, 'processing batch 7 of 12');
  });
  test('summary tag captured separately', () => {
    const n = lib.extractTaskNotice('<task-notification><status>ok</status><summary>1024 rows shipped</summary></task-notification>');
    assertEq(n.status, 'ok');
    assertEq(n.summary, '1024 rows shipped');
  });
});
