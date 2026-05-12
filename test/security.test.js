// Trust posture — no networking from the hook, no third-party deps, no
// dynamic code execution, sane fs writes only.
'use strict';
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const HOOK = fs.readFileSync(path.join(REPO, 'plugins/claudecadence/hooks/scripts/cadence_hook.js'), 'utf8');

suite('hook script — security invariants', () => {
  test('does not require https / http / net / dns / tls', () => {
    const FORBIDDEN = ['require(\'https\')', 'require(\'http\')', 'require(\'net\')', 'require(\'dns\')', 'require(\'tls\')'];
    for (const f of FORBIDDEN) {
      assert(!HOOK.includes(f), 'hook script references ' + f);
    }
  });

  test('does not call eval() / new Function()', () => {
    // The string "Function" appears in JS naturally (function declarations);
    // we look only for `new Function(` and bare `eval(`.
    assert(!/\beval\s*\(/.test(HOOK), 'hook script calls eval()');
    assert(!/\bnew\s+Function\s*\(/.test(HOOK), 'hook script uses new Function()');
  });

  test('does not exec() — shell-string execution is the injection risk', () => {
    // child_process.spawn() is used legitimately to start the cadence-serve
    // binary with a fixed argv. The injection risk is exec() / execSync()
    // which run shell strings.
    assert(!/child_process[^;]*\bexec\b/.test(HOOK), 'hook script destructures exec from child_process');
    assert(!/\bexec(?:Sync)?\s*\(/.test(HOOK),       'hook script calls exec()');
  });

  test('no plugin-level npm dependencies', () => {
    const pkgPath = path.join(REPO, 'plugins/claudecadence/package.json');
    assert(!fs.existsSync(pkgPath), 'plugins/claudecadence/package.json exists — plugin must have zero deps');
  });
});

suite('viewer — no third-party JS loaded by default', () => {
  const html = fs.readFileSync(path.join(REPO, 'plugins/claudecadence/viewer/index.html'), 'utf8');
  test('only outbound resource is Google Fonts CSS, and only when not offline', () => {
    // Google Fonts is fine (documented in SECURITY.md). No other CDN allowed.
    const scriptSrcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
    for (const src of scriptSrcs) {
      assert(!/^https?:\/\//.test(src), 'viewer loads remote script: ' + src);
    }
  });
});
