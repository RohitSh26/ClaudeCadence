# Changelog

All notable changes to ClaudeCadence are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org).

## [Unreleased]

### Added
- Badges in README (latest release, license, stars, zero-cost, no-telemetry).
- `CHANGELOG.md` (this file).
- `CONTRIBUTING.md` with a quickstart for the local-dev loop.
- `.github/ISSUE_TEMPLATE/` with bug-report and feature-request templates.
- `.github/PULL_REQUEST_TEMPLATE.md`.
- Running plugin version surfaced in the viewer chrome.

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
