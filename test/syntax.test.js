// Smoke test — every shipped JS file parses cleanly.
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');

const FILES = [
  'plugins/claudecadence/hooks/scripts/cadence_hook.js',
  'plugins/claudecadence/bin/cadence-serve',
  'plugins/claudecadence/bin/cadence-audit',
  'plugins/claudecadence/bin/cadence-prune',
  'plugins/claudecadence/viewer/_timeline.js',
  'plugins/claudecadence/hub/_home.js',
  'test/run.js',
];

suite('JS syntax', () => {
  for (const rel of FILES) {
    test(rel, () => {
      const abs = path.join(REPO, rel);
      try {
        execFileSync('node', ['--check', abs], { stdio: 'pipe' });
      } catch (e) {
        throw new Error('node --check failed: ' + (e.stderr ? e.stderr.toString() : e.message));
      }
    });
  }
});
