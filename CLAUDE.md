# ClaudeCadence — workspace context

ClaudeCadence is a Claude Code plugin that gives you a live HTML timeline view of your sessions. Hooks-driven, zero extra LLM cost. Distributed via the official Claude Code plugin marketplace from this repo.

This file is read by Claude Code sessions when working in this repo. It tells the assistant the conventions to follow.

## Repository layout

```
ClaudeCadence/
├── .claude-plugin/
│   └── marketplace.json          # marketplace catalog
├── plugins/
│   └── claudecadence/            # the single plugin
│       ├── .claude-plugin/
│       │   └── plugin.json       # plugin manifest
│       ├── hooks/
│       │   ├── hooks.json        # event wiring
│       │   └── scripts/          # hook handlers (Python)
│       ├── commands/             # slash commands
│       ├── viewer/               # per-project HTML/CSS/JS timeline
│       ├── hub/                  # cross-project home page
│       └── bin/                  # binaries on $PATH while plugin is enabled
├── docs/
├── README.md
└── LICENSE
```

## Conventions

- **Python:** stdlib only. No third-party deps. Targets Python 3.10+.
- **JavaScript:** vanilla, no build step. The viewer must work from `http://localhost:<port>/` AND `file://` (where browser cors allows).
- **CSS:** all colors, fonts, radii, shadows, motion easings come from named tokens in `viewer/_design.css`. No magic hex anywhere downstream.
- **Hooks:** fail-soft. Any exception writes a stub diagnostic to stderr and exits 0. A broken viewer must never block a Claude Code session.
- **No telemetry. No hosted services. Everything local.**
- **Vocabulary:** standard engineering names in code (`block`, `node`, `card`, `summary`, `session`). The musical brand vocabulary stays in marketing copy / README.
- **Authorship:** sole author. No `Co-Authored-By` trailers in commits.

## Local development

```bash
claude --plugin-dir ./plugins/claudecadence
```

After changes:

```bash
/reload-plugins
```

Or test with the standalone serve binary:

```bash
python3 plugins/claudecadence/bin/cadence-serve [--hub]
```

### Hot-patching the running plugin without bumping a version

`/reload-plugins` reads from the marketplace working copy at
`~/.claude/plugins/marketplaces/claudecadence/plugins/claudecadence/` AND copies it into a versioned cache at
`~/.claude/plugins/cache/claudecadence/claudecadence/<VERSION>/`. The hook resolves `PLUGIN_ROOT` from
`CLAUDE_PLUGIN_ROOT` which Claude Code points at the **cache** dir — so the marketplace copy alone is not enough.

To hot-patch a fix into a running session, **always touch all three sources**:

1. `~/.claude/plugins/marketplaces/claudecadence/plugins/claudecadence/{viewer,hub,hooks}/...`
2. `~/.claude/plugins/cache/claudecadence/claudecadence/<VERSION>/{viewer,hub,hooks}/...`
3. The active per-project `<PROJECT>/.claude/cadence/{_timeline.js,_design.css,index.html}`

If you skip #2, `bootstrapProject` (which sha-compares cache→project) will silently revert your project-dir patch on the next hook fire. If you skip #3, the change appears only after the next hook fire.

**The hub** lives at `~/.claude/cadence/` and uses its OWN `_design.css` / `_home.js` / `home.html` (different from the per-project viewer). Don't copy the viewer's design.css over the hub's — it will break the heatmap, search, project rows, etc.

## Releasing

Bump `version` in `plugins/claudecadence/.claude-plugin/plugin.json`, tag with `git tag -a vX.Y.Z`, push, then create a GitHub Release.
