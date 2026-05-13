# Changelog

All notable changes to ClaudeCadence are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org).

## [2.5.0] – 2026-05-13

### Added — editorial chrome (port of the design prototype, step 1)
- **Sticky thin topbar** replaces the previous always-expanded filter strip. Layout: `claudecadence`-mark · project name in serif italic · session dropdown · filter pill · sun/moon toggle.
- **Collapsible filter overlay** slides down from the topbar when you click the `filter` pill. The chip count badge on the pill shows how many filters are active. Contains status / agent / time / view + the search field; the live-meter and version-tag moved into the overlay's footer.
- **Centered session dropdown** replaces the left sessions sidebar that used to dominate multi-session projects. Trigger lives in the topbar; click to open a menu listing every session in the project with its status pip, first-prompt title, turn count, and elapsed time. Click a session to switch the view.
- **Scrim** dims the page when either overlay is open. Click scrim or hit `Esc` to close.

### Changed
- The old `.app-header` / `.filter-strip` / `.session-strip` h1 chrome is hidden by CSS overrides — the markup is gone and the rules don't match anymore, but the dormant rules are kept for one release in case anyone has a pinned cache.
- `renderMultiSession` no longer builds a left sidebar; the active session's turns are rendered directly into `#timeline`. The dropdown owns session switching.
- `paintSessionMenu()` is called every render with the *unfiltered* session list, so the dropdown stays accessible even when filters narrow the visible nodes to one session.

### Note
- This is step 1 of the editorial port. Step 2 ports the prompt hero / phase anchors / response band into the live turn renderer. Step 3 ports the full-bleed reading-feed layout. The prototype at `docs/design/index.html` remains the visual reference for both.

## [2.7.1] – 2026-05-13

### Added
- **Auto-`.gitignore` inside `.claude/cadence/`.** `bootstrapProject` now writes a `.gitignore` containing `*` into the per-project cadence directory on first hook fire. Git treats every file inside (viewer source, `nodes.js`, image attachments, bookkeeping) as ignored regardless of the project's root `.gitignore`. Users can never accidentally `git add` 4 MB of session log + screenshots. The file is idempotent (only created if absent) and is itself ignored by its own rule — `bootstrap` rewrites it on the next hook fire if you delete it.

### Changed
- **Legacy harness pseudo-prompts are visible again, rendered compactly.** v2.6.1 silently filtered out pre-v2.4 captures of `<task-notification>` etc. — but that lost data the user wanted to scan. Now those rows render as a compact mono `background event · <cleaned summary> · HH:MM` line (same register as `.is-system-activity`), with the `<status>` / `<summary>` / `<event>` tag extracted client-side via the new `cleanHarnessSummary` helper. The alien XML headline is gone; the data is restored.

## [2.7.0] – 2026-05-13

### Changed — UX overhaul (engineer-first, not magazine-first)
- **Feed width** narrows from 980 → 760 px and prose is **left-aligned again** (reversing v2.6.2's centering). Short responses no longer sit as orphaned centered islands inside a vast sage band; long responses fill the column naturally; tables get to use the full feed width.
- **Tables / pre / image blocks inside `.response`** no longer inherit the prose max-width cap. 4-5 column data tables stop getting squeezed.
- **Command-style prompts render in mono.** `cd ~/.claude/...`, `git pull origin main`, `npm install`, etc. now render as a mono code-block-style headline (apricot left rule + bone bg) instead of a 30 pt serif h1. Heuristic: short, single-line, starts with a shell verb or contains `&&` / `||` / `$ ` / `> `.
- **System-activity turns** ("no prompt — system activity") collapse to a thin mono `session event · HH:MM:SS` line instead of getting a full italic-serif hero. Padding shrinks so they read as compact rows, not full editorial turns.

### Fixed
- **Image-extraction race.** UPS fires before the user-message JSON is flushed to the transcript. The naive backwards walk was finding the **previous** turn's image-bearing message — that's why the "4 images attached" prompt was only rendering 1 image (the prior turn's JPEG). Now `extractAttachedImages` polls for up to 1.5 s and verifies the user-msg's text content matches the prompt we received before accepting its images.

## [2.6.2] – 2026-05-13

### Changed
- **Editorial prose centers within the feed.** Hero h1, lede, full prompt body, and response prose (h3/p/ul/ol) now have `margin-left: auto; margin-right: auto` so the unused width on a wide viewport sits as symmetric whitespace on either side of the column rather than all on the right. Reading column max-width preserved (80-95ch) so line length stays in the editorial sweet spot. Structural elements (phase anchors, ledger lists, rollup tables, dispatch fans) keep full-feed-width for their data layout.
- **Prompt body / response prose bumped to 95ch** (was 80ch). Still inside the 60-95ch readability range; fills the centered column more confidently.

## [2.6.1] – 2026-05-13

### Fixed
- **Long prompts no longer truncated.** The old `splitPromptForHero` capped the lede at 400 chars; a 104-line markdown spec lost most of its body. Refactored to: `h1` is the first markdown heading or first sentence (still capped at 220 chars on a word boundary), and `body` is the full remainder rendered as markdown below the h1. Prompts longer than 1500 chars wrap in a `<details>` with `show full prompt · N lines · M chars` so they don't dominate the turn visually until clicked.
- **Cleaner Monitor-event status lines.** `extractTaskNotice` now prefers the harness's structured fields in order `<status>` → `<summary>` → `<event>` over the verbose cleaned-text fallback. Without this Monitor events ended up with the entire stripped XML on one line in the task-group row. Status caps at 200 chars on a word boundary.
- **Legacy harness pseudo-prompts hidden from the timeline.** Pre-v2.4 captures of `<task-notification>` / `<command-name>` / `<autonomous-loop>` etc. as fresh prompt nodes are now filtered out at render time via `isHarnessPromptNode`. The v2.4 UPS guard prevents new ones; this hides the old ones too without touching `nodes.js`.

### Tests
- 3 new cases in `test/taskgroup.test.js` covering the summary/event fallback and the length cap. Total 78 (was 75).

## [2.6.0] – 2026-05-13

### Added — real image attachments
- When the user attaches a screenshot/photo to a prompt, the hook now extracts the base64 image bytes from the transcript (latest user-message with `image` content blocks), writes them to `.claude/cadence/images/<session>-<turn>-<idx>.<ext>`, and attaches a real `{type:'image', src}` block to the prompt node. The viewer renders the image inline in the prompt-hero as a `<figure>` with `<img>`, sage-ish bordered + drop-shadow on light, deep-shadow on dark.
- Caps: 5 MB per image (base64 length), max 5 images per turn, 80-entry transcript lookback. Oversized images are silently skipped.
- Attachment chip in the prompt-hero eyebrow ("📎 N images attached") now uses the real image-block count when present; falls back to the placeholder count for legacy prompts.
- New `renderers.image` block renderer in `_timeline.js`.

### Tests
- New `test/images.test.js` with 7 cases covering missing file, no-image transcripts, latest-wins selection, max-count cap, oversized skip, media-type default, and lookback-window clamp. Total 75 tests (was 68).

## [2.5.4] – 2026-05-13

### Added
- **Expandable rollup rows.** Each Edit/Write row in the rollup now renders as a `<details>` element; clicking opens the captured diff inline (syntax-highlighted via the existing code-block renderer). Rows for nodes without diffs stay flat. Replaces the static `<table>` rollup.
- **`📎 image attached` chip** in the prompt-hero. The harness leaves literal `[Image #N]` placeholders in `payload.prompt` when the user attaches a screenshot/photo. v2.5.4 strips the placeholder from the h1/lede and surfaces a small apricot chip in the eyebrow row so the user knows one was sent. (Embedding the actual image bytes requires reading the transcript — backlog.)

### Changed
- **Wider response prose.** Reading-column on `.response p / ul / ol / h3` bumped 64ch → 80ch. Was leaving too much empty sage band on wide laptops; 80ch still respects the 60-80 char editorial sweet spot.

## [2.5.3] – 2026-05-13

### Added — feature parity with the design prototype (port step 3)
- **Session pulse coordinate plot.** A horizontal "tape" rendered at the bottom of the feed plots every captured event on a wall-clock axis. Color encodes kind (prompt apricot · response sage · read/search info · edit/fork apricot-warm · bash violet · merge success · failure danger). Two vertical bands separate prompts (top), responses (mid), and tool events (bottom). Axis tick labels show first/middle/last `HH:MM`.
- **Lane accordion on dispatch groups.** Click any sub-agent lane to expand it full-width with siblings collapsing to slim summary bars (matches the prototype dispatch UX). Re-click the expanded lane to return to the equal-split layout. Implemented via CSS `:has()` + a delegated click handler so future dispatches inherit the behavior automatically.
- **Scroll-snap reading feed.** `.workspace` uses `scroll-snap-type: y proximity` and each `li.turn` snaps to the top of the viewport — the TikTok-feel paged reading flow from the mockup, without forcing short turns mid-viewport.
- **Mobile rollup compaction.** Under 640px the rollup table hides the "at" timestamp column so file + change deltas stay readable on narrow screens.

### Fixed
- **Sage tokens missing from `:root`.** `--sage-bg`, `--sage-300/400/500` were referenced by selectors added in v2.5.x but never defined, so the response band had no sage tint on light. Now defined in `:root` (matching the prototype palette) and overridden in `[data-theme="dark"]` to a deeper sage on charcoal.
- **`--violet` token missing.** Bash tag color cascaded to mid-gray instead of the v2.4 violet. Now defined in both themes.

## [2.5.2] – 2026-05-13

### Fixed
- **Rollup table parse bug.** v2.5.1's edit-rollup wrote `<thead>…<tbody>…</tbody></table>` into a `<div>` wrapper without a parent `<table>` tag. Browsers stripped the orphan table markup and dumped the cell text inline (visible as `filechangeat/Users/edhaa/...`). The unbreakable file-path string then forced horizontal page overflow that made every other row look broken. Now sets `innerHTML` on the `<table>` element directly.
- **Long-text wrap in ledger + rollup.** Added `overflow-wrap: anywhere` / `word-break: break-word` and `min-width: 0` on grid items so unbreakable monospace strings (URLs, file paths, full bash invocations) wrap inside their column.
- **Prompt hero truncation.** Hero h1 was the 96-char-truncated `title` (long prompts ended in `ve…`). Now reads `blocks[0].value` and splits on the first sentence boundary; h1 capped at 220 chars on a word boundary, lede at 400.
- **File-path extraction for legacy edits.** Pre-v2.2 nodes without `file_path` get their path parsed from titles like `Edited /path/to/foo.rb`.

### Changed
- Removed the dead `_legacyRenderTurn` stub left from v2.5.1.

## [2.5.1] – 2026-05-13

### Added — editorial turn body (port step 2)
- **Flat turn — no card chrome.** `renderTurn` now emits `<li class="turn">` with a meta strip, a typographic prompt hero, numbered phase anchors per tool family, ledger / rollup tool listings, and a sage-tinted response band. Matches `docs/design/index.html`.
- **Prompt hero.** Source Serif 4 @ clamp(24px → 34px), italic "— you, Xm ago" eyebrow in apricot, optional lede paragraph from the prompt summary. Slash decisions render as a mono headline in apricot.
- **Phase anchors** — `01 · Read & locate`, `02 · Edit & write`, `03 · Verify & run`, etc. Mono numeral in apricot, serif h2, mono stat line. Soft apricot tint behind the numeral column on light; thin apricot left rule on dark.
- **Ledger + rollup bodies.** Reads / bash / search / web render as a compact mono ledger (timestamp · target · kind-tinted tag). Edits render as a rollup table (file · change · at) with `+N −M` deltas in green/red.
- **Response band.** Sage-tinted block on light, bone surface with a 3px sage left rule on dark. Serif body @ 64ch max-width.
- **Dispatch fan preserved.** Sub-agent fork → lanes → merge still uses `renderDispatchGroup` — now sits under a `Plan & dispatch` phase anchor instead of the old "during this turn" button header.

### Fixed
- Duplicate `const selected` in `renderMultiSession` (v2.5.0 regression) — the whole `_timeline.js` failed to parse, so the topbar dropdown never wired up. Renamed to `activeSel`.

### Note
- Step 3 (full-bleed reading-feed layout — scroll-snap, edge-to-edge spacing) still pending.

## [2.4.0] – 2026-05-13

### Added
- **Task-notification grouping** — long-running background tasks (`Bash` with `run_in_background`, scheduled / Auto-Mode work) emit a `<task-notification>` every ~2 minutes. Each one fires `UserPromptSubmit`, which the v2.3 hook captured as a fresh prompt, opening a fresh turn. A 10-minute task could produce 50+ noisy "prompt" rows. v2.4 collapses them: a new `task_group` node is upserted once per `task-id` within the current open turn, count + latest status are folded into one row, and the individual updates are stored as expandable blocks. Click the row to see the timeline of notifications.
- **Editorial design prototype** at `docs/design/index.html` — the full v2.4 visual language locked in a static page. Used as the visual reference for porting into the live viewer.

### Fixed
- **System-injection guard on `UserPromptSubmit`** — `<task-notification>`, `<<autonomous-loop-…>`, `<command-name>`, and the rest of the harness-injected pseudo-prompts no longer create timeline nodes. Previously this was only filtered in `deriveCatchUpNodes`; the UPS handler captured everything UPS emitted.

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
