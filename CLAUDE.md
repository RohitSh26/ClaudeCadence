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

## Releasing

Bump `version` in `plugins/claudecadence/.claude-plugin/plugin.json`, tag with `git tag -a vX.Y.Z`, push, then create a GitHub Release.
