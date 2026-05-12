# Changelog

All notable changes to ClaudeCadence are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org).

## [2.3.2] – 2026-05-12

### Fixed
- **Diff truncation** — `MAX_DIFF_LINES` raised from 200 → 2000 and `MAX_WRITE_PREVIEW` from 80 → 600 so users actually see the full change. The viewer's collapsible `<details>` keeps the card compact when closed, so the higher cap doesn't bloat the timeline.

## [2.3.1] – 2026-05-12

### Fixed
- **Expandable Write/Edit child rows** — v2.3.0 attached a unified diff to every Write/Edit node, but the dispatch-group renderer only displayed the compact summary row, so the diff was unreachable. Rows for nodes that carry `blocks` now render as a `<details>` element; clicking the row reveals the syntax-highlighted diff (or language-detected Write preview) inline. Bash/Read/Grep rows without blocks stay flat as before.

## [2.3.0] – 2026-05-12

### Added
- **Stable layout** — the viewer now splits the timeline into an *active zone* (top, the current prompt+response, the only card that re-renders on poll) and a *frozen history zone* below a divider. Older turns render once and never re-render — eliminates the "fidgety" feel where every 5s rebuild collapsed open cards and reflowed the page.
- **File path + unified-diff in Write/Edit cards** — `Edit` and `MultiEdit` emit a `diff`-lang code block reconstructed from `old_string`/`new_string`; `Write` and `NotebookEdit` emit a language-detected preview (first 80 lines). Cards now answer "what files and what changed" at a glance.
- **Built-in syntax highlighter** — tiny token-based engine (~150 LOC, zero deps) covering JavaScript/TypeScript/JSX/TSX, Python, Bash, JSON, YAML, Go, Rust, Java/Kotlin, SQL, HTML/XML, CSS/SCSS. Hooks into both `renderCode` and `simpleMd` fenced blocks. Palette uses existing theme tokens, so dark/light inherit automatically.
- **Collapsible code blocks** — blocks longer than 12 lines auto-wrap in a `<details>` with "show N lines · lang" summary. Diff coloring is rendered inline (`+`/`−` lines tinted) without a highlighter pass.
- **Long-title tooltips** — truncated card titles now expose the full title via the native `title` attribute on hover.

### Fixed
- **Bug B — mid-stream interrupt.** When the user submits prompt #2 before Stop fires for prompt #1, prompt #1's response no longer absorbs prompt #2's content. `firstAssistantTextAfter` accepts an `upperBound` ts (the next pending turn's UPS lower-bound), capping collection at the strict turn boundary even before user-2's transcript entry physically lands. Six new tests in `test/midstream.test.js`.
- **Premature orchestrator response synthesis** — `deriveCatchUpNodes` no longer emits a partial response for the *active* prompt while sub-agent dispatches are still streaming in. A response is synthesized only when the prompt is no longer the latest OR its last assistant entry is older than 30 s. Stops the in-flight cluster from emitting fresh-but-stale "Claude responded" rows.
- **Malformed `nodes.js` recovery** — corrupt JSON or missing marker now rotates the file to `nodes.js.bak` (keeps last 3 backups) and starts fresh, instead of silently returning `[]` and overwriting on next save.
- **CI** — `node --check` step removed; bash bins `cadence-start` / `cadence-stop` were tripping it. `test/syntax.test.js` already covers the real JS bins via `npm test`.

### Changed
- `renderCode` rewritten to emit `<code>` with `lang-<x>` class, run through `HL.highlight()`, and optionally wrap in `<details>` when the block is long. Diff is special-cased with per-line spans.
- `simpleMd` fenced-code blocks now pass through the same highlighter when a language is specified.
- Poll loop calls `render({ fromPoll: true })` so the active/history split is preserved; filter / mode / hash changes call plain `render()` and trigger a full rebuild via `invalidateFrozenLayout()`.

## [2.2.0] – 2026-05-12

### Added
- README badges (release / license / stars / zero-cost / no-telemetry).
- `CHANGELOG.md` and `CONTRIBUTING.md`.
- `.github/ISSUE_TEMPLATE/` with bug-report and feature-request templates; `.github/PULL_REQUEST_TEMPLATE.md`.
- `.github/workflows/test.yml` — CI matrix (Node 18/20/22 × ubuntu/macos) running `npm test` + `cadence-audit` smoke + `node --check` on every JS file.
- Running plugin version surfaced in the viewer chrome via new `/api/version` endpoint on `cadence-serve`.
- **First-run experience** — empty-state replaced with onboarding hero + 4-card grid + example fork-merge image + slash-command reference.
- **File-edit `+N −M` diff badges** — hook now captures `lines_added` / `lines_removed` from Write/Edit/MultiEdit/NotebookEdit tool_inputs; viewer renders an inline badge in the relevant child rows.
- **Decisions filter pin** in the session-strip — toggle to filter the timeline to decision-kinded nodes and prompts containing decision verbs (decide / chose / use / go with / pick / ship / skip / kill / drop / merge / deploy / approve / reject / defer). Live count badge.
- **Hub dark mode** — full `[data-theme="dark"]` block matching the per-project viewer; theme toggle wired.
- **Activity heatmap on the hub** — 7×24 grid of prompts in the last 14 days across all cadences.
- **Cross-project content search at the hub** — the existing project-name search is now also a node-content search across every cached cadence; grouped results with deep-links.
- **Mobile responsive** layout for both hub and viewer (filter wrap, stack stats, smaller rail, hide version tag below 480px).
- **`bin/cadence-export`** — markdown export CLI (`--since 7d`, `--decisions`, `--session`, `--out`).
- **Test suite in repo** — 48 cases across `test/extract.test.js`, `test/markdown.test.js`, `test/pairing.test.js`, `test/security.test.js`, `test/syntax.test.js`. Custom runner in `test/run.js` (zero deps).
- Plugin manifest keywords: `hooks`, `fork-merge`, `subagent`.

### Changed
- `child-row` rendering consolidated into a single `childRow()` factory shared by both the initial and "show all" code paths.

## [Unreleased]

## [2.1.1] – 2026-05-11

### Fixed
- GFM pipe tables in markdown blocks now render as real `<table>` elements (were showing as literal pipes).

## [2.1.0] – 2026-05-11

### Added
- `SECURITY.md` — full security policy at the repo root.
- `bin/cadence-audit` — read-only pre-flight diagnostic.
- `.github/workflows/codeql.yml` — JavaScript CodeQL with security-extended queries.
- `CLAUDECADENCE_OFFLINE=1` — opt-in offline mode, skips the Google Fonts CDN fetch from the viewer.
- README "Safety" section.

## [2.0.2] – 2026-05-11

### Fixed
- SVG fork/merge curves now render across all browsers (`createElementNS` for paths, not `innerHTML`).
- Adjacent forks in the same turn now cluster into a single parallel-dispatch block with N lanes, matching the iter6 README image.

### Added
- `docs/img/timeline-light.svg` for light-themed README rendering.

## [2.0.1] – 2026-05-11

### Fixed
- Turn cards containing paired fork+merge dispatch groups now auto-open.
- Visible `🔀 N subagent dispatches` badge in the turn-strip.

## [2.0.0] – 2026-05-11

### Added
- Paired fork+merge dispatch-group renders as the iter6 vertical visual (dispatch-card → fork curve → lane label → lane body → merge curve → merge-card).

## [1.10.0] – 2026-05-11

### Added
- `↔ XXXXXX` paired-id badge on fork/merge child rows; apricot tint on fork, success tint on merge.

## [1.9.10] – 2026-05-11

### Fixed
- Skip emission of `SubagentStop` merge when the named subagent already has a recent paired `PostToolUse` merge in the same session (eliminates the orphan "X done" duplicates with `null` tuid).

## [1.9.9] – 2026-05-11

### Added
- `handlePostToolUse(Agent|Task)` writes `source_tool_use_id` on the "X returned" merge.
- Cross-handler dedup via `hasMergeForToolUseId`: PostToolUse and SubagentStop no longer double-emit a merge for the same Agent dispatch.
- Running plugin version shown in `/claudecadence:status` and `/claudecadence:doctor`.

## [1.9.8] – 2026-05-11

### Added
- Path A fork↔merge pairing: `handlePreToolUse(Agent|Task)` writes `source_tool_use_id` on the fork node; `handleSubagentStop` finds the originating Agent's `tool_use_id` (payload or transcript scan).

## [1.9.7] – 2026-05-11

### Fixed
- Graph-derived prompt+response capture replaces the broken v1.9.6 catch-up scan. Transcript parsed as parent-child graph via `parentUuid`; descendants of each real prompt form its response cluster, deduped against existing nodes by `source_uuid` and content+ts window.

### Added
- `bin/cadence-prune` — opt-in cleanup of historical v1.9.4/v1.9.6 garbage prompts.

## [1.9.6] – 2026-05-11

**Reverted.** Cursor-based catch-up had a UPS-before-flush race that duplicated every UPS-fired prompt; the system-injection filter missed `<task-notification>` and `<<autonomous-loop`. Superseded by v1.9.7.

## [1.9.5] – 2026-05-10

### Fixed
- `waitForFirstAssistantTextAfter` now waits for transcript *stability* (600ms unchanged), not just first appearance. Long working responses are captured complete instead of truncated to the first text block.

## [1.9.4] – 2026-05-10

**Buggy in production.** Look-ahead heuristic for mid-stream interrupts misidentified between-turn injections as mid-stream prompts and bled across turn boundaries. Superseded by v1.9.5.

## [1.9.3] – 2026-05-10

### Fixed
- `.time-custom-row[hidden]` grey-gap layout fix.
- Child-group toggle no longer collapses the parent turn card (local DOM mutation, `e.stopPropagation()`).

## [1.9.2] – 2026-05-10

### Added
- Refined dark theme: sage on charcoal (Claude Design iter6). `body { line-height: 1.65 }`, breath animation, soft violet for `decision` status.

## [1.9.1] – 2026-05-10

### Added
- Futuristic deep-space cockpit dark theme (Claude Design iter5). Superseded by iter6 in v1.9.2.

## [1.9.0] – 2026-05-10

### Added
- First dark mode (Claude Design iter4 — warm apricot).

## [1.8.4] – 2026-05-10

### Fixed
- Per-session FIFO queue + global cursor + transcript polling for response pairing. Synthetic-race tests pass 12/12 against real transcript timestamps.

## [1.5.0] and earlier

Foundational releases: sidebar + detail-pane multi-session UX, time-window filter, Node-based viewer server, markdown rendering, auto-restart on update. See git history for details.
