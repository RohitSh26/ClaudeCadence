// Transcript helpers: extractAssistantText, isRealUserPromptEntry,
// isToolResultEntry, isSystemInjection.
'use strict';
const { buildSandbox } = require('./helpers');

const lib = buildSandbox(
  ['extractAssistantText', 'isToolResultEntry', 'isRealUserPromptEntry'],
  ['SYSTEM_INJECTION_RE']
);

suite('extractAssistantText', () => {
  test('string content', () => {
    assertEq(lib.extractAssistantText({ message: { content: '  hello  ' } }), 'hello');
  });
  test('array with text blocks', () => {
    assertEq(lib.extractAssistantText({
      message: { content: [
        { type: 'text', text: 'one' },
        { type: 'tool_use', name: 'Bash' },
        { type: 'text', text: 'two' },
      ] },
    }), 'one\ntwo');
  });
  test('skips empty text blocks', () => {
    assertEq(lib.extractAssistantText({
      message: { content: [{ type: 'text', text: '' }, { type: 'text', text: 'x' }] },
    }), 'x');
  });
});

suite('isToolResultEntry', () => {
  test('user entry with tool_result array → true', () => {
    assertEq(lib.isToolResultEntry({
      message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'r' }] },
    }), true);
  });
  test('user entry with text content → false', () => {
    assertEq(lib.isToolResultEntry({
      message: { content: 'hi' },
    }), false);
  });
});

suite('isRealUserPromptEntry', () => {
  test('plain string user message → true', () => {
    assertEq(lib.isRealUserPromptEntry({ type: 'user', message: { content: 'Deploy please' } }), true);
  });
  test('<system-reminder> → false', () => {
    assertEq(lib.isRealUserPromptEntry({ type: 'user', message: { content: '<system-reminder>noise</system-reminder>' } }), false);
  });
  test('<task-notification> → false', () => {
    assertEq(lib.isRealUserPromptEntry({ type: 'user', message: { content: '<task-notification><task-id>x</task-id></task-notification>' } }), false);
  });
  test('double-bracket <<autonomous-loop-dynamic> → false', () => {
    assertEq(lib.isRealUserPromptEntry({ type: 'user', message: { content: '<<autonomous-loop-dynamic>' } }), false);
  });
  test('<command-name> → false', () => {
    assertEq(lib.isRealUserPromptEntry({ type: 'user', message: { content: '<command-name>/model</command-name>' } }), false);
  });
  test('tool_result array → false (not a string)', () => {
    assertEq(lib.isRealUserPromptEntry({ type: 'user', message: { content: [{ type: 'tool_result' }] } }), false);
  });
  test('empty string → false', () => {
    assertEq(lib.isRealUserPromptEntry({ type: 'user', message: { content: '' } }), false);
  });
  test('paste-from-terminal curl prompt → true (real)', () => {
    assertEq(lib.isRealUserPromptEntry({
      type: 'user',
      message: { content: 'curl https://example.com\nHTTP 200' },
    }), true);
  });
  test('single-char prompt → true', () => {
    assertEq(lib.isRealUserPromptEntry({ type: 'user', message: { content: 'A' } }), true);
  });
});
