# ClaudeCadence

> See the rhythm of your multi-agent Claude Code sessions.

ClaudeCadence is a Claude Code plugin that gives you a **live HTML timeline** of your sessions — every tool call, every sub-agent fork, every PR opened, every decision made — rendered as an expandable, filterable, fork-aware vertical timeline you open in your browser.

It runs entirely on Claude Code's hook system, so it adds **zero extra LLM cost**. The plugin watches what Claude Code is already doing and writes timeline nodes as a side effect. You open the viewer in a browser tab, work normally, watch it fill itself.

```
$ /plugin marketplace add RohitSh26/ClaudeCadence
$ /plugin install claudecadence@claudecadence
$ /claudecadence:serve   # opens http://localhost:4173/
```

That's it. Now go work in Claude Code. The timeline grows in the background.

---

## Why this exists

Multi-agent Claude Code sessions are powerful, but the chat-and-terminal log isn't built for them. When you fork three sub-agents in parallel, scrolling chat doesn't show you who's doing what. When a session runs for hours and you scroll back to find "where did the decision happen," the answer is somewhere in a haystack.

ClaudeCadence is the inverse view: a vertical timeline with branching lanes for parallel sub-agents, color-coded by agent, with rich expandable nodes that hold tables, code, decisions, charts. The structure of the work made visible.

## Status

**v0.1 — initial public release.** Hooks fire correctly, the viewer renders, slash commands work. Visual polish is solid (Geist + Apricot, restrained design). Some chart block types are stubs that will fill in over the next few releases. Issues + feature requests welcome at [github.com/RohitSh26/ClaudeCadence/issues](https://github.com/RohitSh26/ClaudeCadence/issues).

## Install

In any Claude Code session, run:

```
/plugin marketplace add RohitSh26/ClaudeCadence
/plugin install claudecadence@claudecadence
```

That's the canonical install — Claude Code clones this repo into its plugin cache and wires the hooks. No npm, no pip, no separate binaries.

## Use

```
/claudecadence:serve     # start the local viewer + open browser
/claudecadence:status    # how many nodes recorded so far
/claudecadence:stop      # stop the local server
```

That's it. The hooks handle the rest. **You don't have to remember to log anything** — the timeline just fills itself as you work.

If you want richer narrative on key milestones (decisions, PR merges, customer signals), add a single line to your project's `CLAUDE.md`:

> When a meaningful milestone happens (PR merged, decision made, sub-agent dispatched, blocker discovered), append a node to `.claude/cadence/data/nodes.js` via the append script.

This is opt-in and costs a few tokens per session. Without it, hooks alone give you a complete event log.

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

Per-project, never global:

```
your-project/
└── .claude/
    └── cadence/
        ├── index.html          # the viewer (copied from the plugin on first run)
        ├── _design.css
        ├── _timeline.js
        └── data/
            └── nodes.js         # your timeline data
```

Nothing leaves your machine. The "live indicator" pulse you see in the header is a CSS animation — there's no server-side anything.

## Architecture

- **Hooks** ([`plugins/claudecadence/hooks/`](plugins/claudecadence/hooks/)) emit timeline nodes as a side effect of Claude Code's lifecycle events. Zero LLM cost.
- **Viewer** ([`plugins/claudecadence/viewer/`](plugins/claudecadence/viewer/)) is a self-contained HTML page rendered with the Geist + Apricot design tokens. Works from `http://localhost:4173/`.
- **Slash commands** ([`plugins/claudecadence/commands/`](plugins/claudecadence/commands/)) for `serve` / `stop` / `status` / `open`.
- **Data model** ([`docs/DATA-MODEL.md`](docs/DATA-MODEL.md)) — JSON schema for timeline nodes.

For the hook taxonomy and how to add custom nodes, see [`docs/HOOKS.md`](docs/HOOKS.md).

## Local development

```bash
git clone https://github.com/RohitSh26/ClaudeCadence
cd ClaudeCadence
claude --plugin-dir ./plugins/claudecadence
```

Iterate, then `/reload-plugins` to pick up changes without restarting Claude Code.

## Design

The visual language is Geist + Apricot — a sibling to the Anthropic/Claude design family without trying to be it. Restrained palette, generous whitespace, monospace numerics, kinetic type. Every visual decision is in [`viewer/_design.css`](plugins/claudecadence/viewer/_design.css) under named tokens — no inline magic colors.

## License

[MIT](LICENSE) — use it however you like.

## Author

[Rohit Sharma](https://github.com/RohitSh26)
