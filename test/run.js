#!/usr/bin/env node
// ClaudeCadence — test runner.
// Walks test/*.test.js, runs each, reports pass/fail. Tiny ad-hoc runner
// rather than a dependency (the plugin has zero runtime deps and we
// keep the same discipline here).
//
// Usage:
//   node test/run.js                     # run all
//   node test/run.js test/foo.test.js    # run one

'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const TESTS_DIR = path.dirname(__filename);

// Tiny assertion API exposed on globalThis for each test file.
let curSuite = '(unset)';
let pass = 0, fail = 0, suites = 0;
const failures = [];

global.suite = function (name, fn) {
  curSuite = name;
  suites += 1;
  try {
    fn();
  } catch (e) {
    fail += 1;
    failures.push({ suite: curSuite, test: '(setup)', message: e.message + '\n' + e.stack });
  }
};
global.test = function (name, fn) {
  try {
    fn();
    pass += 1;
    process.stdout.write('.');
  } catch (e) {
    fail += 1;
    failures.push({ suite: curSuite, test: name, message: e.message });
    process.stdout.write('x');
  }
};
global.assertEq = function (got, want, label) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) {
    throw new Error((label ? label + ' :: ' : '') +
      'got ' + (a ?? 'undefined') + ' want ' + b);
  }
};
global.assert = function (cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
};
global.assertMatch = function (got, regex, label) {
  if (!regex.test(String(got))) {
    throw new Error((label ? label + ' :: ' : '') +
      'value ' + JSON.stringify(got) + ' did not match ' + regex);
  }
};

// Discover test files: argv if any, else everything *.test.js in test/
const files = args.length
  ? args
  : fs.readdirSync(TESTS_DIR)
      .filter(f => f.endsWith('.test.js'))
      .map(f => path.join(TESTS_DIR, f));

if (!files.length) {
  console.error('No test files found.');
  process.exit(2);
}

console.log(`ClaudeCadence test run · ${files.length} file${files.length===1?'':'s'}\n`);
for (const f of files) {
  curSuite = path.basename(f, '.test.js');
  process.stdout.write(`${curSuite}: `);
  try {
    require(path.resolve(f));
  } catch (e) {
    fail += 1;
    failures.push({ suite: curSuite, test: '(load)', message: e.message + '\n' + e.stack });
    process.stdout.write('X');
  }
  process.stdout.write('\n');
}

console.log();
if (failures.length) {
  console.log('FAILURES:');
  for (const f of failures) {
    console.log(`  [${f.suite}] ${f.test}`);
    for (const line of f.message.split('\n')) console.log('    ' + line);
  }
  console.log();
}
console.log(`${pass} passed · ${fail} failed · ${suites} suite${suites===1?'':'s'}`);
process.exit(fail > 0 ? 1 : 0);
