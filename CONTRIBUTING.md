# Contributing to ClaudeCadence

Thanks for the interest. This is a small plugin maintained by one person — the bar for "good contribution" is whatever moves the plugin forward without breaking what works.

## Quickstart

```bash
git clone https://github.com/RohitSh26/ClaudeCadence
cd ClaudeCadence

# Test the plugin in-place — no install step
claude --plugin-dir ./plugins/claudecadence

# After changes to hook scripts or viewer files:
/reload-plugins
# …in any active Claude Code session.
```

The whole plugin is under 5,000 lines of code. Read it before changing it.

- **Hook script:** [`plugins/claudecadence/hooks/scripts/cadence_hook.js`](plugins/claudecadence/hooks/scripts/cadence_hook.js) — one file, handles every lifecycle event.
- **Viewer server:** [`plugins/claudecadence/bin/cadence-serve`](plugins/claudecadence/bin/cadence-serve) — Node, no deps.
- **Viewer page:** [`plugins/claudecadence/viewer/`](plugins/claudecadence/viewer/) — vanilla HTML / CSS / JS, no build step.

## Conventions

- **Python:** stdlib only. No third-party deps. Targets Python 3.10+.
- **JavaScript:** vanilla, no build step. Must work from `http://localhost:<port>/` AND `file://` (where browser CORS allows).
- **CSS:** all colors, fonts, radii, shadows, motion easings come from named tokens in `viewer/_design.css`. No magic hex anywhere downstream.
- **Hooks:** fail-soft. Any exception writes a stub diagnostic to stderr and exits 0. A broken viewer must never block a Claude Code session.
- **No telemetry. No hosted services. Everything local.** This is the core promise. Don't add anything that violates it.

## Tests

Run the test suite before opening a PR:

```bash
npm test            # or: node test/run.js
```

If you add new behavior, add a test in `test/`.

## Pull requests

- Keep PRs focused. One feature or one fix per PR.
- Include `node --check` results for any modified JS files. CI also runs this.
- For changes to hook capture logic, include a test case in `test/` that exercises the new behavior against a synthetic transcript.
- Don't update version numbers in PRs — the maintainer handles that on release.

## Reporting bugs

Use the bug report template at [`.github/ISSUE_TEMPLATE/bug_report.md`](.github/ISSUE_TEMPLATE/bug_report.md).

For security issues, see [`SECURITY.md`](SECURITY.md) — do **not** open a public issue for those.

## Design changes

The visual language is byte-faithful to Claude Design's iter6 specification (`sage on charcoal` dark / `apricot on bone` light). Changes that touch the visual language should reference an iter from the design system; otherwise you'll be asked to.

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).

## Code of conduct

Be decent. The maintainer reserves the right to close discussions that don't add signal.
