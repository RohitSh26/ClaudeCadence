# ClaudeCadence

[![Latest release](https://img.shields.io/github/v/release/RohitSh26/ClaudeCadence?sort=semver&display_name=tag&color=6ee7c1&labelColor=151921)](https://github.com/RohitSh26/ClaudeCadence/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-9af0d4?labelColor=151921)](LICENSE)
[![Stars](https://img.shields.io/github/stars/RohitSh26/ClaudeCadence?style=flat&color=fcd34d&labelColor=151921)](https://github.com/RohitSh26/ClaudeCadence/stargazers)
[![Zero LLM cost](https://img.shields.io/badge/LLM%20cost-%240.00-86efac?labelColor=151921)](#cost)
[![No telemetry](https://img.shields.io/badge/telemetry-none-93c5fd?labelColor=151921)](SECURITY.md)

> See the rhythm of your multi-agent Claude Code sessions.

<p align="center">
  <img alt="ClaudeCadence timeline — dark theme" src="docs/img/timeline-dark.svg" width="100%">
  <br><sub><em>Dark · sage on charcoal</em></sub>
</p>

<p align="center">
  <img alt="ClaudeCadence timeline — light theme" src="docs/img/timeline-light.svg" width="100%">
  <br><sub><em>Light · apricot on bone</em></sub>
</p>

ClaudeCadence is a Claude Code plugin that gives you a **live HTML timeline** of your sessions — every tool call, every sub-agent fork, every PR opened, every decision made — rendered as an expandable, filterable, fork-aware vertical timeline you open in your browser.

> **🔋 Zero extra LLM cost — guaranteed.**
> ClaudeCadence runs **entirely** on Claude Code's hook system. Hooks are shell scripts that fire on lifecycle events; they never call an LLM. The plugin doesn't send a single extra token to Anthropic, doesn't use your API key, doesn't add anything to your existing Claude Code bill. **No tokens. No subscription. No telemetry. No hosted services.** It only watches what Claude Code is already doing and writes the timeline as a side effect.

You open the viewer in a browser tab, work normally, watch it fill itself.

```
$ /plugin marketplace add RohitSh26/ClaudeCadence
$ /plugin install claudecadence@claudecadence
```

That's it. **The viewer auto-starts on the next SessionStart** — no slash command needed. Open `http://localhost:4173/` (or whichever port the plugin printed in the "Session started" node). Now go work in Claude Code. The timeline grows in the background and the browser tab auto-refreshes every 5 seconds.

Want it off? Set `CLAUDECADENCE_NO_AUTO_SERVE=1` in your shell. Then start it manually with `/claudecadence:serve` or `cadence-start` from any terminal.

---

## Why this exists

Multi-agent Claude Code sessions are powerful, but the chat-and-terminal log isn't built for them. When three sub-agents fork in parallel, scrolling chat doesn't show what's happening. When a session runs for hours and you scroll back to find "where did the decision happen," the answer is somewhere in a haystack.

ClaudeCadence is the inverse view: a vertical timeline with branching lanes for parallel sub-agents, color-coded by agent, with rich expandable nodes that hold tables, code, decisions, charts. The structure of the work made visible.

## Status

**v1.6 — Node-only, no Python.** The hook handler and local server are now pure Node.js. Since Claude Code itself ships with Node, the plugin runs anywhere Claude Code runs — Windows-native included. Zero npm dependencies; built-ins only. (v1.5 introduced the sidebar + detail-pane multi-session UX, hub auto-prune, *viewer up* live indicator, and per-cadence *forget* button.) Earlier tags (v1.0–v1.3) had install reliability issues — they're marked as pre-release on GitHub. Use **v1.4.0 or later**. Issues + feature requests welcome at [github.com/RohitSh26/ClaudeCadence/issues](https://github.com/RohitSh26/ClaudeCadence/issues).

If anything looks off after install, run **`/claudecadence:doctor`** in Claude Code — it prints a checklist of every component (hooks loaded, viewer files, server, registry, recent activity) and tells you what to fix.

## Install

In any Claude Code session, run:

```
/plugin marketplace add RohitSh26/ClaudeCadence
/plugin install claudecadence@claudecadence
```

That's the canonical install — Claude Code clones this repo into its plugin cache and wires the hooks. No npm, no pip, no separate binaries.

## Use

```
/claudecadence:home      # cross-project home page (every cadence, with status)
/claudecadence:serve     # this project's full timeline
/claudecadence:status    # how many nodes recorded so far in this project
/claudecadence:stop      # stop the local server
/claudecadence:doctor    # self-diagnostic if anything looks off
```

Default port is **4173**. If something else is already on 4173, the plugin **auto-walks** to the first free port up to 4181 and prints the URL — no config needed.

That's it. The hooks handle the rest. **You don't have to remember to log anything** — the timeline just fills itself as you work, and the viewer auto-refreshes every 5 seconds while you watch.

## Two surfaces

### The home (`/claudecadence:home`)

Every Claude Code session you've ever opened with this plugin enabled is registered as a "cadence." The home page lists them all with:

- **Status pill** — *active* (last activity within 5 min) · *stale* (within 24 h) · *inactive* (older).
- **Last activity** (relative timestamp) and **node count**.
- **Filter by status**, **search by name or path**.
- Click any cadence → drops you into that project's full timeline.

Useful when you're juggling multiple projects and want to know which sessions are still hot.

### The per-project timeline (`/claudecadence:serve`)

The full vertical timeline for one project. Each node is a moment in the session: tool calls, decisions, sub-agent forks, PRs, CI events. Compact when collapsed, rich when expanded (with markdown · tables · code · checklists · decisions · charts · key-value blocks). Filter by status / agent, search across titles + summaries, switch between full / summary / compact view modes, expand-all / collapse-all.

The viewer **auto-refreshes every 5 seconds** — no manual reload needed once the tab is open.

## What gets recorded

| Event | Hook | Node kind |
|---|---|---|
| Session starts | `SessionStart` | `ci` |
| User submits a prompt | `UserPromptSubmit` | `response` |
| Sub-agent dispatched | `PreToolUse` (Agent / Task) | `fork` |
| Sub-agent returns | `PostToolUse` (Agent / Task) | `merge` |
| Bash runs `git` / `gh` | `PostToolUse` (Bash) | `commit` / `pr` / `ci` |
| Sub-agent's turn ends | `SubagentStop` | `merge` |
| Session turn ends | `Stop` | `response` |

Other Bash commands, file reads, edits, etc. are intentionally **not** recorded — the bar is "would you care about this in 3 days?"

## Cost

| Item | Cost |
|---|---|
| Plugin install | Free |
| Plugin runtime | **$0.00** — hooks are shell scripts, no LLM call |
| Optional richer narrative (opt-in) | Pennies on your existing Claude Code bill |
| Infrastructure | None — everything is local, static HTML, no servers |
| Telemetry | None, ever |

## Where data lives

Per-project (the timeline for one project):

```
your-project/
└── .claude/
    └── cadence/
        ├── index.html          # the viewer (copied from the plugin on first run)
        ├── _design.css
        ├── _timeline.js
        └── data/
            └── nodes.js        # this project's timeline data
```

Per-user (the cross-project home + registry):

```
~/.claude/cadence/
├── home.html                   # cross-project home page
├── _design.css
├── _home.js
└── registry.json               # which projects you've used the plugin in
```

Nothing leaves your machine. The "live" indicator pulse is a CSS animation — there's no server-side anything.

## Safety

The whole plugin is under 5,000 lines of code, with no build step and no third-party runtime dependencies. You can read it end-to-end in 20 minutes. [`SECURITY.md`](SECURITY.md) is the full policy; the precise list:

**What this plugin does:**
- Reads its hook payload from stdin (JSON, per-event, ephemeral)
- Reads the active session transcript at `~/.claude/projects/<slug>/<session>.jsonl` (on `Stop` + `SubagentStop` only)
- Appends nodes to `<project>/.claude/cadence/data/nodes.js`
- Writes per-session bookkeeping in `<project>/.claude/cadence/` (queue, cursor, current-turn files)
- Registers in `~/.claude/cadence/registry.json`
- Spawns one local HTTP server (`cadence-serve`) bound to `127.0.0.1`, project-local port

**What this plugin never does:**
- No telemetry, no analytics, no usage pings
- No outbound network calls from the hook
- No reads outside `~/.claude/` (and within it, only the transcript Claude Code gave the hook)
- No writes outside `.claude/cadence/` directories
- No access to credentials, env vars, or system files
- No `eval()`, no dynamic code execution, no shell injection
- No third-party dependencies — zero `package.json` runtime deps

**Optional network call (viewer only):** the timeline HTML page loads Geist + Source Serif 4 + Geist Mono from `fonts.googleapis.com`. To go fully airgapped, set `CLAUDECADENCE_OFFLINE=1` and the `<link>` is omitted.

**Audit before you enable:** run [`cadence-audit`](plugins/claudecadence/bin/cadence-audit) — read-only diagnostic that prints the plugin version, the exact hook events it registers, the paths it would write to, network calls it would make, and a SHA-256 of the hook script. Makes no changes.

**Reproducible installs:** no build step. The git tag is the artifact, byte-for-byte. Pin to a specific tag if you want immutability.

## Architecture

- **Hooks** ([`plugins/claudecadence/hooks/`](plugins/claudecadence/hooks/)) emit timeline nodes as a side effect of Claude Code's lifecycle events. Zero LLM cost. Filtered for signal — Bash hooks only fire on `git` / `gh` commands.
- **Per-project viewer** ([`plugins/claudecadence/viewer/`](plugins/claudecadence/viewer/)) is a self-contained HTML page that polls its own `nodes.js` every 5 s and re-renders on change.
- **Cross-project hub** ([`plugins/claudecadence/hub/`](plugins/claudecadence/hub/)) is the home page with the cadence list and status filters.
- **Slash commands** ([`plugins/claudecadence/commands/`](plugins/claudecadence/commands/)) for `home` / `serve` / `stop` / `status` / `open`.

## Local development

```bash
git clone https://github.com/RohitSh26/ClaudeCadence
cd ClaudeCadence
claude --plugin-dir ./plugins/claudecadence
```

Iterate, then `/reload-plugins` to pick up changes without restarting Claude Code.

## Design

The visual language is Geist + Apricot — a sibling to the broader Claude design family without trying to be it. Restrained palette, generous whitespace, monospace numerics, kinetic type. Every visual decision is in [`viewer/_design.css`](plugins/claudecadence/viewer/_design.css) under named tokens — no inline magic colors anywhere.

## License

[MIT](LICENSE) — use it however you like.

## Author

[Rohit Sharma](https://github.com/RohitSh26)
