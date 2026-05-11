# Security Policy

ClaudeCadence is a Claude Code plugin that records your session's lifecycle events to a local HTML timeline. This document spells out exactly what it does, what it doesn't do, and how to report any concerns.

## Threat model in one sentence

If you trust the Node.js binary that Claude Code is already using, you trust ClaudeCadence — it adds no third-party runtime dependencies, makes no outbound network calls except (optionally) to Google Fonts from the viewer, and has access to nothing Claude Code itself doesn't already see.

## What this plugin does

| Action | Where | When |
|---|---|---|
| Reads its hook input from `stdin` (JSON) | Per-event, ephemeral | On every Claude Code lifecycle hook |
| Reads the active session transcript | `~/.claude/projects/<slug>/<session>.jsonl` | On `Stop` and `SubagentStop` |
| Appends one or more nodes to `nodes.js` | `<project>/.claude/cadence/data/nodes.js` | On every hook event |
| Writes per-session bookkeeping | `<project>/.claude/cadence/.queue-*.txt`, `.cursor-*.txt`, `.current_turn.txt` | Per turn |
| Registers in the cross-project hub registry | `~/.claude/cadence/registry.json` | On `SessionStart` |
| Starts a local HTTP server (`cadence-serve`) | Binds `127.0.0.1` on a project-local port | First hook event in a session, if auto-serve is enabled |

That's it. Everything else is rendering in your browser from the `nodes.js` file the plugin already produced.

## What this plugin never does

- **No telemetry, no analytics, no usage pings.** Nothing about your sessions leaves your machine. There is no opt-in, opt-out, environment variable, or hidden setting that changes this — the code to do it doesn't exist.
- **No outbound network calls from the hook itself.** The hook script never opens a socket, never resolves a hostname, never executes a remote command.
- **No reads outside `~/.claude/`** — and even within `~/.claude/`, only the transcript file Claude Code already gives the hook in its payload.
- **No writes outside `<project>/.claude/cadence/` and `~/.claude/cadence/`.** No touching your source tree.
- **No access to credentials, environment variables, or system files.** The hook only sees what Claude Code passes it via stdin and reads the transcript path Claude Code provided.
- **No `eval()`, no dynamic code execution, no shell injection.** The hook never `exec`s a command derived from user input.
- **No third-party dependencies.** Zero `package.json` runtime deps. The plugin runs on Node's standard library.
- **No background processes other than the local HTTP viewer.** That server stops when you stop it (`cadence-stop` or kill the pid in `<project>/.claude/cadence/.server.pid`).

## Network access

The **hook** makes no network calls. Period.

The **viewer HTML page** (when you open the timeline in a browser) loads one external resource: Google Fonts at `fonts.googleapis.com` (Geist + Source Serif 4 + Geist Mono). The viewer falls back to system fonts if blocked.

To make the viewer fully airgapped, set `CLAUDECADENCE_OFFLINE=1` in your shell — the `<link>` to Google Fonts will be omitted on next render. (Available from v2.0.3+.)

## Verifying the plugin before you enable it

Before enabling, you can audit exactly what the plugin would do:

```bash
# After install but before any session — the audit is read-only:
cadence-audit
```

This prints:
- The current plugin version
- The exact list of hook events the plugin registers
- The exact paths it would write to
- The network calls it would make
- A SHA-256 checksum of the hook script

The audit makes no changes and writes nothing.

## Supply chain

- **No build step.** The git tag is the artifact, byte-for-byte. Nothing is transpiled, minified, or bundled between source and what runs in your environment.
- **No npm install.** The plugin has zero runtime dependencies. Look for the absence of `package.json` in `plugins/claudecadence/`.
- **Sole author.** Every commit is signed by `Rohit Sharma <rohit.sharma1048@gmail.com>`. Verify with `git log --show-signature`.
- **All releases tagged.** Every published version has a corresponding git tag. To pin to a specific tag rather than `main`, fork or clone at that tag.

## Reviewing the code

The entire plugin is under 5,000 lines of code. Read it end-to-end:

- `plugins/claudecadence/hooks/hooks.json` — declares the hook→script bindings
- `plugins/claudecadence/hooks/scripts/cadence_hook.js` — the single hook script (every lifecycle event lands here)
- `plugins/claudecadence/bin/cadence-serve` — the local HTTP viewer server
- `plugins/claudecadence/viewer/` — vanilla HTML/CSS/JS

If anything in the code looks suspicious, please open an issue or email.

## Reporting a vulnerability

If you find a security issue, please **do not** open a public GitHub issue. Email:

- **rohit.sharma1048@gmail.com**

with the subject prefix `[ClaudeCadence security]`. Include:

- A description of the issue
- Reproduction steps (or a proof-of-concept)
- The plugin version (`cadence-audit` or `cat $CLAUDE_PLUGIN_ROOT/.claude-plugin/plugin.json`)
- Your suggested severity

I will acknowledge within 72 hours and aim to ship a fix within 7 days for confirmed critical issues. Lower-severity issues will be handled in the next regular release.

## Disclosure policy

After a fix is shipped to `main` and tagged, the vulnerability details will be published as a GitHub Security Advisory on this repository. Credit will be given to the reporter unless they prefer to remain anonymous.

## Out of scope

- Security of Claude Code itself
- Security of Node.js
- Misconfiguration of file permissions on the user's machine
- Issues caused by other plugins or local tampering with `nodes.js`
