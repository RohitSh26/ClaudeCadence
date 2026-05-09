# Backlog

Things parked for after the next release.

## Distribution

- Submit to the official Anthropic plugin marketplace via [claude.ai/settings/plugins/submit](https://claude.ai/settings/plugins/submit).
- Add a screenshot of the live timeline to the README (best taken after a real session).
- Add a 30-second demo GIF.
- Logo / brand mark (currently just text). OG-image for social shares.

## Functionality

- Server-Sent Events for the per-project viewer (currently polls every 5 s).
- Per-project config file (`.claude/cadence/config.json`) for hook tuning, lane colors, default view mode.
- Wire real data sources for the remaining chart blocks (`agent_heatmap`, `lane_flow`, `progress_arc`).
- Cross-session view: two parallel sessions in the same project rendered side by side.
- Export a session as a static HTML bundle for sharing.

## Robustness

- Truncation + tooltip for very long titles / summaries.
- Graceful recovery from a malformed `nodes.js` (with `.bak` rotation).
- Browser matrix testing (Safari + Firefox + Chrome).
- Performance at 500+ nodes per cadence.
- Strict UTF-8 handling on hook input.

## Documentation

- `docs/HOOKS.md` — full hook taxonomy + how to add custom ones.
- `docs/DATA-MODEL.md` — JSON schema for nodes + block types.
- `docs/COOKBOOK.md` — examples of customizing what gets recorded.
- `CONTRIBUTING.md`.
