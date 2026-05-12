// Shared helpers for the test suite — extract real functions out of the
// hook script for unit testing.
'use strict';
const fs = require('fs');
const path = require('path');

const HOOK_PATH = path.join(__dirname, '..', 'plugins', 'claudecadence', 'hooks', 'scripts', 'cadence_hook.js');
const HOOK_SRC  = fs.readFileSync(HOOK_PATH, 'utf8');

function extractFunc(name) {
  // Match `function NAME(...) { ... }` at top level — naive but works for
  // our file since every function is at the indent we use.
  const re = new RegExp('^function ' + name + '[\\s\\S]*?\\n\\}\\n', 'm');
  const m = HOOK_SRC.match(re);
  if (!m) throw new Error('extractFunc: could not find function ' + name);
  return m[0];
}

function extractConstLine(name) {
  const re = new RegExp('^const ' + name + ' = .*$', 'm');
  const m = HOOK_SRC.match(re);
  if (!m) throw new Error('extractConstLine: could not find const ' + name);
  return m[0];
}

// Build a sandbox with chosen helpers from the hook script. Pass in fakes
// like loadNodes; the sandbox calls them when the real code does.
function buildSandbox(funcNames, constNames, fakes) {
  fakes = fakes || {};
  const consts = (constNames || []).map(extractConstLine).join('\n');
  const funcs  = (funcNames  || []).map(extractFunc).join('\n\n');
  const code   = consts + '\n\n' + funcs;
  const fakeNames  = Object.keys(fakes);
  const fakeValues = fakeNames.map(k => fakes[k]);
  // Build a function that exposes the funcNames as a returned object
  const body = code + '\nreturn { ' + funcNames.join(', ') + ' };';
  const fn = new Function(...fakeNames, body);
  return fn(...fakeValues);
}

module.exports = {
  HOOK_PATH,
  HOOK_SRC,
  extractFunc,
  extractConstLine,
  buildSandbox,
};
