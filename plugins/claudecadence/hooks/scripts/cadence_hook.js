#!/usr/bin/env node
/**
 * ClaudeCadence — single hook handler for all Claude Code lifecycle events.
 * Node port of cadence_hook.py (v1.6).
 *
 * Reads the hook payload from stdin (JSON), decides whether the event is
 * worth logging, and appends a timeline node to:
 *
 *     $CLAUDE_PROJECT_DIR/.claude/cadence/data/nodes.js
 *
 * Zero npm dependencies — uses Node built-ins only. Claude Code already
 * ships Node, so the plugin runs anywhere Claude Code runs.
 *
 * Fail-soft: any exception writes a stub diagnostic to stderr and exits 0.
 * A broken viewer must never block the user's Claude Code session.
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const crypto   = require('crypto');
const { spawn } = require('child_process');

// ─────────────────────────── Filesystem layout ───────────────────────────

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT
  ? path.resolve(process.env.CLAUDE_PLUGIN_ROOT)
  : path.resolve(__dirname, '..', '..');
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR
  ? path.resolve(process.env.CLAUDE_PROJECT_DIR)
  : process.cwd();
const CADENCE_DIR  = path.join(PROJECT_DIR, '.claude', 'cadence');
const DATA_DIR     = path.join(CADENCE_DIR, 'data');
const NODES_JS     = path.join(DATA_DIR, 'nodes.js');
const VIEWER_SOURCE = path.join(PLUGIN_ROOT, 'viewer');
const HUB_SOURCE   = path.join(PLUGIN_ROOT, 'hub');

// Per-turn grouping. UserPromptSubmit writes a fresh turn id; subsequent
// hooks read it and tag their nodes; Stop clears it.
const CURRENT_TURN_FILE = path.join(CADENCE_DIR, '.current_turn.txt');

// Hub: per-user registry of all cadences across projects.
const HUB_DIR = process.env.CLAUDECADENCE_HUB_DIR
  ? path.resolve(process.env.CLAUDECADENCE_HUB_DIR)
  : path.join(os.homedir(), '.claude', 'cadence');
const REGISTRY_JSON = path.join(HUB_DIR, 'registry.json');

const NODES_HEADER =
  '/**\n' +
  ' * ClaudeCadence — timeline nodes for this project.\n' +
  ' * Auto-managed by hooks. Do not edit by hand.\n' +
  ' */\n' +
  'window.TIMELINE_NODES = ';
const NODES_FOOTER = ';\n';

// ─────────────────────────── Small utils ─────────────────────────────────

function nowIso() {
  // Match python: "%Y-%m-%dT%H:%M:%SZ" (no millis)
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function fileSha(p) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  } catch (_) {
    return '';
  }
}

function safeMkdir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch (_) {}
}

function readTextOr(p, fallback) {
  try { return fs.readFileSync(p, 'utf8'); } catch (_) { return fallback; }
}

function shortHex(n) {
  return crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (_) { return false; }
}

function logErr(msg) {
  try { process.stderr.write(`[claudecadence] ${msg}\n`); } catch (_) {}
}

// ─────────────────────────── Bootstrap ───────────────────────────────────

function copyDirRecursive(src, dst) {
  // Used for first-time copy of `data/` etc. Does not overwrite existing files.
  safeMkdir(dst);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else if (!fs.existsSync(d)) {
      try { fs.copyFileSync(s, d); } catch (_) {}
    }
  }
}

function bootstrapProject() {
  safeMkdir(DATA_DIR);
  if (!fs.existsSync(NODES_JS)) {
    fs.writeFileSync(NODES_JS, NODES_HEADER + '[]' + NODES_FOOTER);
  }
  if (!fs.existsSync(VIEWER_SOURCE)) return 0;
  let refreshed = 0;
  for (const entry of fs.readdirSync(VIEWER_SOURCE, { withFileTypes: true })) {
    const src = path.join(VIEWER_SOURCE, entry.name);
    const dst = path.join(CADENCE_DIR, entry.name);
    if (entry.isDirectory()) {
      // Only `data/` could be in here; never overwrite the user's data dir.
      if (!fs.existsSync(dst)) copyDirRecursive(src, dst);
      continue;
    }
    // File — refresh if hash differs (so plugin updates surface in browser).
    if (!fs.existsSync(dst) || fileSha(dst) !== fileSha(src)) {
      try {
        fs.copyFileSync(src, dst);
        refreshed += 1;
      } catch (_) {}
    }
  }
  return refreshed;
}

function registerInHub(sessionId) {
  safeMkdir(HUB_DIR);
  // Copy hub viewer files (home.html, _home.js, etc.) on first run.
  if (fs.existsSync(HUB_SOURCE)) {
    for (const entry of fs.readdirSync(HUB_SOURCE, { withFileTypes: true })) {
      const src = path.join(HUB_SOURCE, entry.name);
      const dst = path.join(HUB_DIR, entry.name);
      if (entry.isDirectory()) {
        if (!fs.existsSync(dst)) copyDirRecursive(src, dst);
      } else if (!fs.existsSync(dst)) {
        try { fs.copyFileSync(src, dst); } catch (_) {}
      }
    }
  }
  let registry = { version: 1, cadences: [] };
  if (fs.existsSync(REGISTRY_JSON)) {
    try { registry = JSON.parse(fs.readFileSync(REGISTRY_JSON, 'utf8')); }
    catch (_) {}
  }
  if (!Array.isArray(registry.cadences)) registry.cadences = [];

  const projectPath = fs.realpathSync(PROJECT_DIR);
  const name = path.basename(projectPath) || 'unnamed';
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unnamed';

  const bySlug = {};
  for (const c of registry.cadences) bySlug[c.slug] = c;
  if (bySlug[slug] && bySlug[slug].path !== projectPath) {
    let suffix = 2;
    while (bySlug[`${slug}-${suffix}`]) suffix += 1;
    slug = `${slug}-${suffix}`;
  }

  const ts = nowIso();
  const found = registry.cadences.find(c => c.path === projectPath);
  if (!found) {
    registry.cadences.push({
      slug,
      name,
      path: projectPath,
      first_seen: ts,
      last_session_id: sessionId || '',
    });
  } else if (sessionId) {
    found.last_session_id = sessionId;
  }
  fs.writeFileSync(REGISTRY_JSON, JSON.stringify(registry, null, 2));
}

// ─────────────────────────── Node persistence ────────────────────────────

function loadNodes() {
  if (!fs.existsSync(NODES_JS)) return [];
  const text = fs.readFileSync(NODES_JS, 'utf8');
  // Match: window.TIMELINE_NODES = [ ... ];
  const m = text.match(/window\.TIMELINE_NODES\s*=\s*(\[[\s\S]*\])\s*;/);
  if (!m) return [];
  try { return JSON.parse(m[1]); } catch (_) { return []; }
}

function saveNodes(nodes) {
  safeMkdir(DATA_DIR);
  fs.writeFileSync(NODES_JS, NODES_HEADER + JSON.stringify(nodes, null, 2) + NODES_FOOTER);
}

function newId(seq, ts) {
  const safeTs = ts.replace(/:/g, '-').replace(/Z$/, '');
  const seqStr = String(seq).padStart(4, '0');
  return `n_${seqStr}_${safeTs}_${shortHex(6)}`;
}

function currentTurnId() {
  try {
    if (fs.existsSync(CURRENT_TURN_FILE)) {
      const t = fs.readFileSync(CURRENT_TURN_FILE, 'utf8').trim();
      return t || null;
    }
  } catch (_) {}
  return null;
}

function beginTurn() {
  const tid = 't_' + shortHex(10);
  safeMkdir(CADENCE_DIR);
  try { fs.writeFileSync(CURRENT_TURN_FILE, tid); } catch (_) {}
  return tid;
}

function endTurn() {
  try { if (fs.existsSync(CURRENT_TURN_FILE)) fs.unlinkSync(CURRENT_TURN_FILE); } catch (_) {}
}

// Cross-hook lock around nodes.js. Node has no flock; use O_EXCL on a
// lockfile and busy-wait briefly. Hook calls are short, so contention is
// rare and brief.
function withNodesLock(fn) {
  safeMkdir(DATA_DIR);
  const lockfile = path.join(DATA_DIR, '.nodes.lock');
  const deadline = Date.now() + 3000;  // 3s cap; fail-soft if longer
  let fd = -1;
  while (Date.now() < deadline) {
    try {
      fd = fs.openSync(lockfile, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o644);
      break;
    } catch (err) {
      if (err && err.code === 'EEXIST') {
        // Stale lock? If older than 5s, drop it.
        try {
          const st = fs.statSync(lockfile);
          if (Date.now() - st.mtimeMs > 5000) fs.unlinkSync(lockfile);
        } catch (_) {}
        // Tiny sleep — synchronous, but only 5ms.
        const tEnd = Date.now() + 5;
        while (Date.now() < tEnd) { /* spin */ }
        continue;
      }
      // Any other error — give up on locking and proceed (fail-soft).
      break;
    }
  }
  try {
    return fn();
  } finally {
    if (fd >= 0) {
      try { fs.closeSync(fd); } catch (_) {}
      try { fs.unlinkSync(lockfile); } catch (_) {}
    }
  }
}

function appendNode(node) {
  withNodesLock(() => {
    const nodes = loadNodes();
    const seq = nodes.length + 1;
    const ts = node.ts || nowIso();
    if (!node.ts)        node.ts = ts;
    if (!node.id)        node.id = newId(seq, ts);
    if (!node.session)   node.session = 'main';
    if (!node.kind)      node.kind = 'response';
    if (!node.status)    node.status = 'completed';
    if (!node.tags)      node.tags = [];
    if (!node.blocks)    node.blocks = [];
    if (!('parents' in node)) {
      node.parents = nodes.length ? [nodes[nodes.length - 1].id] : [];
    }
    if (!('turn_id' in node)) {
      const tid = currentTurnId();
      if (tid) node.turn_id = tid;
    }
    nodes.push(node);
    saveNodes(nodes);
  });
}

// ─────────────────────────── Auto-serve ──────────────────────────────────

function maybeAutoServe(opts) {
  opts = opts || {};
  const pidfile  = path.join(CADENCE_DIR, '.server.pid');
  const portfile = path.join(CADENCE_DIR, '.server.port');

  // Force-kill path runs BEFORE the env-var short-circuit, so a stale server
  // gets bounced even when CLAUDECADENCE_NO_AUTO_SERVE is set.
  if (fs.existsSync(pidfile)) {
    const pid = parseInt(readTextOr(pidfile, '').trim(), 10);
    if (isPidAlive(pid)) {
      if (opts.force) {
        // Plugin update or explicit restart — kill the running server so we
        // spawn a fresh one that picks up the new viewer files.
        try { process.kill(pid, 'SIGTERM'); } catch (_) {}
        const deadline = Date.now() + 500;
        while (Date.now() < deadline && isPidAlive(pid)) {
          const tEnd = Date.now() + 25;
          while (Date.now() < tEnd) { /* busy */ }
        }
        if (isPidAlive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch (_) {} }
        try { fs.unlinkSync(pidfile); } catch (_) {}
        try { fs.unlinkSync(portfile); } catch (_) {}
      } else {
        const port = parseInt(readTextOr(portfile, '').trim(), 10);
        return Number.isFinite(port) ? port : null;
      }
    } else {
      try { fs.unlinkSync(pidfile); } catch (_) {}
    }
  }

  if (process.env.CLAUDECADENCE_NO_AUTO_SERVE) return null;

  const serveBin = path.join(PLUGIN_ROOT, 'bin', 'cadence-serve');
  if (!fs.existsSync(serveBin)) return null;

  safeMkdir(CADENCE_DIR);
  const logPath = path.join(CADENCE_DIR, '.server.log');
  let logFd = -1;
  try {
    logFd = fs.openSync(logPath, 'w');
    const child = spawn(serveBin, [PROJECT_DIR, '--no-open'], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: process.env,
    });
    fs.writeFileSync(pidfile, String(child.pid));
    child.unref();
  } catch (exc) {
    logErr(`auto-serve failed: ${exc && exc.message || exc}`);
    if (logFd >= 0) { try { fs.closeSync(logFd); } catch (_) {} }
    return null;
  }
  // Best-effort wait for the port file.
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (fs.existsSync(portfile)) {
      const port = parseInt(readTextOr(portfile, '').trim(), 10);
      return Number.isFinite(port) ? port : null;
    }
    const tEnd = Date.now() + 100;
    while (Date.now() < tEnd) { /* busy */ }
  }
  return null;
}

// ─────────────────────────── Event helpers ───────────────────────────────

function shortStr(s, n) {
  if (n === undefined) n = 100;
  s = (s || '').replace(/\n/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function sessionIdOf(payload) {
  return String(payload.session_id || 'main').slice(0, 12);
}

// ─────────────────────────── Event handlers ──────────────────────────────

function handleSessionStart(payload, ctx) {
  const refreshed = (ctx && ctx.refreshed) || 0;
  const port = maybeAutoServe({ force: refreshed > 0 });
  let summary = `Working in ${path.basename(PROJECT_DIR)}`;
  if (port) summary += ` — viewer at http://localhost:${port}/`;
  if (refreshed > 0) summary += ` (refreshed ${refreshed} viewer file${refreshed === 1 ? '' : 's'})`;
  return {
    agent: 'external',
    kind: 'ci',
    status: 'completed',
    title: 'Session started',
    summary,
    tags: ['session', 'start'],
    session: sessionIdOf(payload),
  };
}

function handleUserPrompt(payload) {
  const prompt = (payload.prompt || '').trim();
  if (!prompt) return null;
  const session = sessionIdOf(payload);
  const tid = beginTurn();
  // Push this turn onto the per-session FIFO with the current "lower bound"
  // (latest assistant ts in transcript right now). Stop will pop it later
  // and only consider assistant texts that arrived AFTER this lower bound.
  try {
    pushPendingTurn(
      session,
      tid,
      latestAssistantTs(payload.transcript_path) || ''
    );
  } catch (_) {}
  const isSlash = prompt.startsWith('/');
  const titleLine = prompt.split('\n', 1)[0];
  const title = titleLine.length > 96 ? titleLine.slice(0, 96) + '…' : titleLine;
  let summary = prompt.slice(0, 160).replace(/\n/g, ' ').trim();
  if (prompt.length > 160) summary += '…';
  const blocks = [{ type: 'markdown', value: prompt.slice(0, 200000) }];
  return {
    agent: 'founder',
    kind: isSlash ? 'decision' : 'response',
    status: 'completed',
    title,
    summary,
    tags: ['prompt'].concat(isSlash ? ['slash'] : []),
    session,
    turn_id: tid,
    blocks,
  };
}

function handlePreToolUse(payload) {
  const tool = payload.tool_name || '';
  const ti = payload.tool_input || {};
  if (tool === 'Agent' || tool === 'Task') {
    const sub  = ti.subagent_type || ti.agent_type || 'subagent';
    const desc = ti.description || '';
    const promptPreview = shortStr(ti.prompt || '', 200);
    const blocks = promptPreview ? [{ type: 'markdown', value: promptPreview }] : [];
    // Pairing key (path A): capture the originating tool_use_id so SubagentStop
    // can look it up later and the renderer can group fork+merge into one
    // dispatch unit. Try the documented field first, then fallbacks.
    const tuid = payload.tool_use_id
              || (payload.tool_use && payload.tool_use.id)
              || ti.tool_use_id
              || null;
    const node = {
      agent: 'orchestrator',
      kind: 'fork',
      status: 'in_progress',
      title: `Dispatched → ${sub}` + (desc ? `: ${shortStr(desc, 80)}` : ''),
      summary: shortStr(desc || promptPreview, 160),
      tags: ['fork', 'dispatch', String(sub)],
      session: sessionIdOf(payload),
      blocks,
    };
    if (tuid) node.source_tool_use_id = tuid;
    return node;
  }
  return null;
}

function handlePostToolUse(payload) {
  const tool = payload.tool_name || '';
  const ti   = payload.tool_input || {};
  const tr   = payload.tool_response;
  const session = sessionIdOf(payload);

  if (tool === 'Agent' || tool === 'Task') {
    const sub = ti.subagent_type || ti.agent_type || 'subagent';
    // Pairing key (v1.9.9): capture tool_use_id so the renderer can pair this
    // PostToolUse merge with its originating fork.
    const tuid = payload.tool_use_id
              || (payload.tool_use && payload.tool_use.id)
              || ti.tool_use_id
              || null;
    // Cross-handler dedup (v1.9.9): if SubagentStop already emitted a merge
    // for this exact tool_use_id, skip — we'd be double-counting.
    if (tuid && hasMergeForToolUseId(session, tuid)) return null;
    let resultText = '';
    if (tr && typeof tr === 'object') {
      resultText = tr.result || tr.content || '';
    } else if (typeof tr === 'string') {
      resultText = tr;
    }
    resultText = shortStr(resultText, 600);
    const blocks = resultText ? [{ type: 'markdown', value: resultText }] : [];
    const node = {
      agent: String(sub),
      kind: 'merge',
      status: 'completed',
      title: `${sub} returned`,
      summary: shortStr(resultText, 160) || 'completed',
      tags: ['merge', 'subagent', String(sub)],
      session,
      blocks,
    };
    if (tuid) node.source_tool_use_id = tuid;
    return node;
  }

  if (tool === 'Bash') {
    const cmd = (ti.command || '').trim();
    if (!cmd) return null;
    if (/^\s*(cd|ls|pwd|cat|echo|true|false|wc)(\s|$)/.test(cmd)) return null;
    const firstToken = cmd.split(/\s+/, 1)[0] || '';
    let kind;
    if (cmd.includes('gh run') || cmd.includes('gh pr checks')) kind = 'ci';
    else if (cmd.includes('gh pr') || cmd.includes('gh issue')) kind = 'pr';
    else if (firstToken === 'git') kind = 'commit';
    else kind = 'tool_call';
    const firstLine = shortStr(cmd.split('\n', 1)[0], 120);
    return {
      agent: 'external',
      kind,
      status: 'completed',
      title: `$ ${firstLine}`,
      summary: ti.description || '',
      tags: ['bash', firstToken],
      session,
      blocks: [{ type: 'code', lang: 'bash', value: cmd.slice(0, 2000) }],
    };
  }

  if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    const filePath = ti.file_path || ti.notebook_path || 'unknown';
    const verb = {
      Write: 'Wrote',
      Edit: 'Edited',
      MultiEdit: 'Edited (multi)',
      NotebookEdit: 'Edited notebook',
    }[tool] || 'Touched';
    // v2.2 — compute precise +added / -removed line counts from the tool
    // input. This is read-only on the payload Claude Code already passed; no
    // file system inspection. Used by the viewer to render "+12 −3" badges
    // on file-edit child rows.
    const countLines = (s) => (typeof s === 'string' && s.length) ? (s.split('\n').length) : 0;
    let added = 0, removed = 0;
    if (tool === 'Write') {
      added = countLines(ti.content || ti.new_string || '');
    } else if (tool === 'Edit') {
      added = countLines(ti.new_string || '');
      removed = countLines(ti.old_string || '');
    } else if (tool === 'MultiEdit') {
      for (const e of (ti.edits || [])) {
        added += countLines(e.new_string || '');
        removed += countLines(e.old_string || '');
      }
    } else if (tool === 'NotebookEdit') {
      added = countLines(ti.new_source || '');
    }
    let totalLines = 0;
    if (tr && typeof tr === 'object') {
      const content = tr.content || '';
      if (typeof content === 'string' && content.includes('\n')) {
        totalLines = content.split('\n').length;
      }
    }
    const summaryParts = [];
    if (added)      summaryParts.push('+' + added);
    if (removed)    summaryParts.push('−' + removed);          // U+2212 minus
    if (totalLines) summaryParts.push(totalLines + ' lines');
    const summary = summaryParts.join(' · ');
    return {
      agent: 'orchestrator',
      kind: 'tool_call',
      status: 'completed',
      title: `${verb} ${filePath}`,
      summary,
      tags: ['file', verb.toLowerCase().split(/\s+/)[0]],
      session,
      file_path: filePath,
      lines_added: added,
      lines_removed: removed,
      lines_total: totalLines,
    };
  }

  if (tool === 'Read') {
    const filePath = ti.file_path || 'unknown';
    return {
      agent: 'orchestrator',
      kind: 'tool_call',
      status: 'completed',
      title: `Read ${filePath}`,
      summary: '',
      tags: ['file', 'read'],
      session,
    };
  }

  if (tool === 'Grep' || tool === 'Glob') {
    const pattern = ti.pattern || ti.path || '';
    return {
      agent: 'orchestrator',
      kind: 'tool_call',
      status: 'completed',
      title: `${tool} ${shortStr(pattern, 80)}`,
      summary: '',
      tags: ['search', tool.toLowerCase()],
      session,
    };
  }

  if (tool === 'WebFetch' || tool === 'WebSearch') {
    const target = ti.url || ti.query || '';
    return {
      agent: 'orchestrator',
      kind: 'tool_call',
      status: 'completed',
      title: `${tool}: ${shortStr(target, 80)}`,
      summary: '',
      tags: ['web', tool.toLowerCase()],
      session,
    };
  }

  return null;
}

function handleSubagentStop(payload) {
  const session = sessionIdOf(payload);
  const sub = payload.subagent_type || payload.agent_type || payload.agent || 'subagent';
  // Pairing key (path A): find the originating fork's tool_use_id so renderer
  // can group fork+merge into one dispatch unit. Three sources of truth, in
  // order of trustworthiness:
  //   1. SubagentStop payload — if Claude Code includes it directly
  //   2. Transcript scan — find the most recent Agent/Task tool_use whose id
  //      doesn't already appear on an existing merge node in this session
  //   3. null — no paired fork found (background-task noise stop)
  let tuid = payload.tool_use_id
          || (payload.tool_use && payload.tool_use.id)
          || null;
  if (!tuid) {
    try { tuid = findUnpairedAgentToolUseId(payload.transcript_path, session); }
    catch (_) { /* leave tuid null */ }
  }
  // Cross-handler dedup (v1.9.9+): three ways this SubagentStop can be a
  // duplicate of a PostToolUse merge for the same Agent dispatch —
  //   1. Same tool_use_id already on an existing merge.
  //   2. tuid was null (PostToolUse drained the only unpaired Agent fork),
  //      AND this SubagentStop is for a NAMED subagent (not generic),
  //      AND a paired merge for that named subagent fired recently — almost
  //      certainly the same dispatch (v1.9.10).
  // Skip only the merge node; still run the catch-up scan below so
  // orchestrator prompts/responses keep getting recovered.
  let skipMerge = false;
  if (tuid && hasMergeForToolUseId(session, tuid)) {
    skipMerge = true;
  } else if (!tuid && hasRecentPairedMergeForAgent(session, sub, 600)) {
    skipMerge = true;
  }
  const merge = {
    agent: String(sub),
    kind: 'merge',
    status: 'completed',
    title: `${sub} done`,
    summary: 'Returned to orchestrator',
    tags: ['subagent', 'stop', String(sub)],
    session,
  };
  if (tuid) merge.source_tool_use_id = tuid;
  // Recover any prompts/responses that bypassed UPS/Stop in this session
  // (orchestrator pattern). Idempotent — dedup ensures no double-emission.
  let derived = [];
  try { derived = deriveCatchUpNodes(payload.transcript_path, session); }
  catch (exc) { logErr(`graph derivation failed: ${exc && exc.message || exc}`); }
  if (skipMerge) return derived.length ? derived : null;
  return derived.length ? derived.concat([merge]) : merge;
}

function extractAssistantText(obj) {
  const msg = obj.message || obj;
  const content = msg.content || obj.content || msg.text || obj.text;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const btype = block.type;
    if ((btype === 'text' || btype === undefined) && typeof block.text === 'string') {
      parts.push(block.text);
    }
  }
  return parts.filter(Boolean).join('\n').trim();
}

// Return the Nth assistant *text* message in the transcript (1-indexed),
// skipping entries that have no text content (pure tool_use, etc.).
function nthAssistantText(transcriptPath, n) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  let raw;
  try { raw = fs.readFileSync(transcriptPath, 'utf8'); } catch (_) { return null; }
  const lines = raw.split('\n');
  let count = 0;
  for (const ln of lines) {
    const trimmed = ln.trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch (_) { continue; }
    if ((obj.type || obj.role) !== 'assistant') continue;
    const text = extractAssistantText(obj);
    if (!text) continue;
    count += 1;
    if (count === n) return text;
  }
  return null;
}

// Backward-compatible: the *latest* assistant text in the transcript.
function lastAssistantText(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  let raw;
  try { raw = fs.readFileSync(transcriptPath, 'utf8'); } catch (_) { return null; }
  const lines = raw.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch (_) { continue; }
    if ((obj.type || obj.role) !== 'assistant') continue;
    const text = extractAssistantText(obj);
    if (text) return text;
  }
  return null;
}

// ─── Pending-stop queue + per-session cursor ──────────────────────────────
// The transcript contains many "user" entries that don't correspond to OUR
// UserPromptSubmit hooks (slash command meta, tool results, internal recaps).
// Counting transcript entries against our captured Stop count produces drift.
//
// Robust approach: on every UserPromptSubmit, push a turn record to a
// per-session FIFO queue. On every Stop, pop the OLDEST queued turn and
// pair it with the first NEW assistant text in the transcript, advancing a
// per-session cursor as we consume. Combines:
//   - FIFO queue (handles rapid-fire — Stops fire in submission order)
//   - lower-bound ts per turn (excludes asst messages older than the UPS)
//   - global cursor (excludes anything we've already consumed)
//   - polling (defeats the transcript-flush race observed in real sessions)

function queueFile(session)  { return path.join(CADENCE_DIR, `.queue-${session}.txt`);  }
function cursorFile(session) { return path.join(CADENCE_DIR, `.cursor-${session}.txt`); }

function pushPendingTurn(session, turnId, lowerBoundTs) {
  const f = queueFile(session);
  const line = `${turnId || ''}|${lowerBoundTs || ''}\n`;
  try { fs.appendFileSync(f, line); } catch (_) {}
}

function popPendingTurn(session) {
  const f = queueFile(session);
  if (!fs.existsSync(f)) return null;
  let raw; try { raw = fs.readFileSync(f, 'utf8'); } catch (_) { return null; }
  const lines = raw.split('\n').filter(Boolean);
  if (!lines.length) { try { fs.unlinkSync(f); } catch (_) {} return null; }
  const head = lines.shift();
  try {
    if (lines.length) fs.writeFileSync(f, lines.join('\n') + '\n');
    else fs.unlinkSync(f);
  } catch (_) {}
  const [turnId, lowerBoundTs] = head.split('|');
  return { turnId: turnId || null, lowerBoundTs: lowerBoundTs || null };
}

function readCursor(session) {
  try { return fs.readFileSync(cursorFile(session), 'utf8').trim() || null; }
  catch (_) { return null; }
}
function writeCursor(session, ts) {
  try { fs.writeFileSync(cursorFile(session), String(ts)); } catch (_) {}
}

// ─── Fork→merge pairing (path A, v1.9.8+) ────────────────────────────────
//
// True if any existing merge node in this session already references the
// given tool_use_id. Used by both PostToolUse and SubagentStop to avoid
// emitting double-merge nodes for the same Agent dispatch (v1.9.9). Whichever
// of the two hooks fires first records the merge; the second one short-
// circuits.
function hasMergeForToolUseId(session, tuid) {
  if (!tuid) return false;
  try {
    for (const n of loadNodes()) {
      if ((n.session || 'main') !== session) continue;
      if ((n.kind || '') !== 'merge') continue;
      if (n.source_tool_use_id === tuid) return true;
    }
  } catch (_) {}
  return false;
}

// True if a paired merge for the same NAMED subagent fired recently in this
// session. Used as a fallback when SubagentStop can't find a tool_use_id
// (because PostToolUse already paired the most recent Agent dispatch) — the
// SubagentStop is almost certainly the dupe for the same dispatch. Only
// applies to named subagents; generic 'subagent' is treated as noise and
// always emits. (v1.9.10)
function hasRecentPairedMergeForAgent(session, agentName, windowSec) {
  if (!agentName || agentName === 'subagent') return false;
  const cutoff = Date.now() - windowSec * 1000;
  try {
    for (const n of loadNodes()) {
      if ((n.session || 'main') !== session) continue;
      if ((n.kind || '') !== 'merge') continue;
      if (!n.source_tool_use_id) continue;             // only paired merges count
      if ((n.agent || '') !== agentName) continue;
      const ts = Date.parse(n.ts || '');
      if (Number.isFinite(ts) && ts >= cutoff) return true;
    }
  } catch (_) {}
  return false;
}

// Walk the transcript looking for Agent/Task tool_use blocks. Return the id
// of the most recent one whose id isn't already on an existing merge node in
// this session — i.e. the next unpaired dispatch. Used by handleSubagentStop
// when the SubagentStop payload doesn't carry the originating tool_use_id.
function findUnpairedAgentToolUseId(transcriptPath, session) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  let raw; try { raw = fs.readFileSync(transcriptPath, 'utf8'); } catch (_) { return null; }

  // Build the set of tool_use_ids already paired with a merge node.
  const usedIds = new Set();
  try {
    for (const n of loadNodes()) {
      if ((n.session || 'main') !== session) continue;
      if ((n.kind || '') !== 'merge') continue;
      if (n.source_tool_use_id) usedIds.add(n.source_tool_use_id);
    }
  } catch (_) {}

  // Walk transcript in REVERSE so we find the latest unpaired dispatch first.
  const lines = raw.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim(); if (!t) continue;
    let o; try { o = JSON.parse(t); } catch (_) { continue; }
    if ((o.type || o.role) !== 'assistant') continue;
    const c = o.message && o.message.content;
    if (!Array.isArray(c)) continue;
    for (const block of c) {
      if (!block || typeof block !== 'object') continue;
      if (block.type !== 'tool_use') continue;
      const name = block.name || '';
      if (name !== 'Agent' && name !== 'Task') continue;
      const id = block.id || '';
      if (!id) continue;
      if (usedIds.has(id)) continue;
      return id;  // most recent unpaired dispatch
    }
  }
  return null;
}

// ─── Graph-derived prompt+response capture ────────────────────────────────
//
// In normal Claude Code sessions, UserPromptSubmit fires for every human
// prompt and Stop fires for every Claude turn. But in orchestrator /
// remote-control sessions, prompts get injected mid-turn, UPS doesn't fire,
// and Stop never closes the outer turn — only SubagentStop fires. The whole
// conversation goes invisible to Cadence even though Claude Code is
// processing it locally.
//
// The fix: treat the transcript as the parent-child graph it actually is.
// Every entry has a `parentUuid` pointing to the entry it descends from.
// A "real human prompt" is the root of a work cluster — all descendant
// assistant entries (bounded by the next real prompt's uuid) form Claude's
// response to it. We derive prompt + response timeline nodes from this
// structure, with strict dedup against existing nodes.
//
// Dedup strategy:
//   1. Source-uuid match (authoritative): if any existing node carries
//      source_uuid === candidate.source_uuid, skip.
//   2. Content+ts-window match (legacy): for nodes that pre-date this code
//      (no source_uuid), match by first-150-char text + ts within ±5s.
//      Catches UPS-fired prompts so we don't double-emit them.
//
// This survives: UPS-before-transcript-flush race, hook re-runs across
// version changes, missed UPS events (orchestrator), missed Stop events
// (orchestrator). Idempotent — running twice on the same transcript
// produces the same nodes.

const SYSTEM_INJECTION_RE = /^<+(task-notification|system-reminder|local-command-|command-name|command-message|command-args|command-stdout|command-stderr|autonomous-loop)/;

// Real human prompt: user-string content not starting with a known injection
// marker. Plain-text user entries are real prompts (verified across normal,
// orchestrator, and AutoMode transcripts; even paste-from-terminal counts).
function isRealUserPromptEntry(o) {
  if ((o.type || o.role) !== 'user') return false;
  const c = o.message && o.message.content;
  if (typeof c !== 'string') return false;
  const head = c.trimStart();
  if (!head) return false;
  if (head.startsWith('<') && SYSTEM_INJECTION_RE.test(head)) return false;
  return true;
}

function buildTranscriptGraph(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  let raw; try { raw = fs.readFileSync(transcriptPath, 'utf8'); } catch (_) { return null; }
  const entries = [];
  const byUuid = new Map();
  const childrenOf = new Map();
  for (const ln of raw.split('\n')) {
    const t = ln.trim(); if (!t) continue;
    let o; try { o = JSON.parse(t); } catch (_) { continue; }
    if (!o.uuid) continue;
    entries.push(o);
    byUuid.set(o.uuid, o);
    if (o.parentUuid) {
      let arr = childrenOf.get(o.parentUuid);
      if (!arr) { arr = []; childrenOf.set(o.parentUuid, arr); }
      arr.push(o.uuid);
    }
  }
  return { entries, byUuid, childrenOf };
}

// BFS descendants of a root, stopping at any uuid in stopAt (sibling prompts).
function descendantsOfPrompt(graph, rootUuid, stopAtUuids) {
  const visited = new Set();
  const queue = [rootUuid];
  while (queue.length) {
    const u = queue.shift();
    if (visited.has(u)) continue;
    visited.add(u);
    for (const c of (graph.childrenOf.get(u) || [])) {
      if (stopAtUuids.has(c)) continue;
      queue.push(c);
    }
  }
  visited.delete(rootUuid);
  return [...visited].map(u => graph.byUuid.get(u)).filter(Boolean);
}

// Index existing nodes for dedup AND turn_id linkage. Returns:
//   uuidSet:    Set<source_uuid>          — strict match for new-style nodes
//   keyMap:     Map<contentKey, [{ts,turn_id}]> — fuzzy match for legacy nodes;
//                 turn_id lets a derived response link to an existing UPS-fired
//                 prompt's turn so they group correctly in the timeline UI.
//   respByTid:  Set<turn_id> — turn_ids that already have a response node.
//                 Prevents emitting a second response for a growing cluster
//                 (orchestrator turns where the last-assistant uuid changes
//                 between derivation passes).
function indexExistingNodes(nodes) {
  const uuidSet = new Set();
  const keyMap = new Map();
  const respByTid = new Set();
  for (const n of nodes) {
    if (n.source_uuid) uuidSet.add(n.source_uuid);
    const tags = n.tags || [];
    const isPrompt = tags.indexOf('prompt') !== -1;
    const isResponse = tags.indexOf('response') !== -1;
    if (!isPrompt && !isResponse) continue;
    if (isResponse && n.turn_id) respByTid.add(n.turn_id);
    const text = (n.title || '') + '|' + (n.summary || '').slice(0, 100);
    const k = (isPrompt ? 'P:' : 'R:') + text;
    let arr = keyMap.get(k);
    if (!arr) { arr = []; keyMap.set(k, arr); }
    arr.push({ ts: n.ts || '', turn_id: n.turn_id || null });
  }
  return { uuidSet, keyMap, respByTid };
}

// Within ±5 seconds is "the same node" for legacy fuzzy match.
function tsWithinWindow(a, b, windowMs) {
  if (!a || !b) return false;
  const da = Date.parse(a), db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return false;
  return Math.abs(da - db) <= windowMs;
}

function isAlreadyCaptured(idx, sourceUuid, kind, title, summary, ts) {
  if (sourceUuid && idx.uuidSet.has(sourceUuid)) return true;
  const text = (title || '') + '|' + (summary || '').slice(0, 100);
  const k = (kind === 'prompt' ? 'P:' : 'R:') + text;
  const list = idx.keyMap.get(k);
  if (!list) return false;
  for (const e of list) {
    if (tsWithinWindow(e.ts, ts, 5000)) return true;
  }
  return false;
}

// Look up an existing prompt node's turn_id by content+ts. Used so a derived
// response for a UPS-already-captured prompt links to the original prompt's
// turn_id rather than getting a fresh uuid-derived one (which would orphan it
// in the timeline UI).
function findExistingPromptTurnId(idx, title, summary, ts) {
  const text = (title || '') + '|' + (summary || '').slice(0, 100);
  const list = idx.keyMap.get('P:' + text);
  if (!list) return null;
  for (const e of list) {
    if (tsWithinWindow(e.ts, ts, 5000) && e.turn_id) return e.turn_id;
  }
  return null;
}

function makeTitleAndSummary(text, fallbackTitle) {
  const firstLine = text.split('\n', 1)[0].trim();
  const title = firstLine.length > 96
    ? firstLine.slice(0, 96) + '…'
    : (firstLine || fallbackTitle);
  let summary = text.slice(0, 160).replace(/\n/g, ' ').trim();
  if (text.length > 160) summary += '…';
  return { title, summary };
}

// Derive timeline nodes from the transcript graph, deduplicated against
// existing nodes.js. Returns array of nodes ready to append.
function deriveCatchUpNodes(transcriptPath, session) {
  const graph = buildTranscriptGraph(transcriptPath);
  if (!graph) return [];

  const realPrompts = graph.entries.filter(isRealUserPromptEntry);
  if (!realPrompts.length) return [];
  const promptUuids = new Set(realPrompts.map(p => p.uuid));

  const idx = indexExistingNodes(loadNodes());
  const out = [];

  for (const prompt of realPrompts) {
    const ptext = (prompt.message.content || '').trim();
    if (!ptext) continue;
    const pts = prompt.timestamp || prompt.ts || null;
    const { title: ptitle, summary: psummary } = makeTitleAndSummary(ptext, 'User prompt');

    // turn_id linkage: if this prompt was already captured by UPS, reuse the
    // existing prompt's turn_id so the derived response groups under it in
    // the UI. Otherwise mint a new uuid-derived turn_id.
    const existingTid = findExistingPromptTurnId(idx, ptitle, psummary, pts);
    const turnId = existingTid || ('t_' + prompt.uuid.replace(/-/g, '').slice(0, 10));

    // Prompt node
    if (!isAlreadyCaptured(idx, prompt.uuid, 'prompt', ptitle, psummary, pts)) {
      const isSlash = ptext.startsWith('/');
      out.push({
        agent: 'founder',
        kind: isSlash ? 'decision' : 'response',
        status: 'completed',
        title: ptitle,
        summary: psummary,
        tags: ['prompt', 'graph'].concat(isSlash ? ['slash'] : []),
        session,
        turn_id: turnId,
        ts: pts,
        source_uuid: prompt.uuid,
        blocks: [{ type: 'markdown', value: ptext.slice(0, 200000) }],
      });
    }

    // Response node = joined assistant text from descendants.
    //
    // One response per prompt. If the prompt's turn_id already has a response
    // node (UPS-Stop or earlier graph derivation), skip — this prevents a
    // growing in-flight orchestrator cluster from emitting a fresh response
    // each time it gets bigger between SubagentStop fires.
    if (idx.respByTid.has(turnId)) continue;

    const desc = descendantsOfPrompt(graph, prompt.uuid, promptUuids);
    const asstSorted = desc
      .filter(o => (o.type || o.role) === 'assistant')
      .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
    if (!asstSorted.length) continue;

    const rtext = asstSorted.map(extractAssistantText).filter(Boolean).join('\n');
    if (!rtext) continue;
    const lastAsst = asstSorted[asstSorted.length - 1];
    const respUuid = lastAsst.uuid;
    const rts = lastAsst.timestamp || lastAsst.ts || pts;
    const { title: rtitle, summary: rsummary } = makeTitleAndSummary(rtext, 'Claude responded');

    if (isAlreadyCaptured(idx, respUuid, 'response', rtitle, rsummary, rts)) continue;

    out.push({
      agent: 'orchestrator',
      kind: 'response',
      status: 'completed',
      title: rtitle,
      summary: rsummary,
      tags: ['response', 'graph'],
      session,
      turn_id: turnId,
      ts: rts,
      source_uuid: respUuid,
      blocks: [{ type: 'markdown', value: rtext.slice(0, 200000) }],
    });
    // Mark this turn as having a response so subsequent prompts in this same
    // pass don't see it as available either.
    idx.respByTid.add(turnId);
  }

  return out;
}


// Latest assistant TEXT timestamp in the transcript right now (or null).
function latestAssistantTs(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  let raw; try { raw = fs.readFileSync(transcriptPath, 'utf8'); } catch (_) { return null; }
  const lines = raw.split('\n');
  let latest = null;
  for (const ln of lines) {
    const t = ln.trim(); if (!t) continue;
    let o; try { o = JSON.parse(t); } catch (_) { continue; }
    if ((o.type || o.role) !== 'assistant') continue;
    const text = extractAssistantText(o);
    if (!text) continue;
    const ts = o.timestamp || o.ts || (o.message && (o.message.created_at || o.message.timestamp)) || null;
    if (ts && (!latest || ts > latest)) latest = ts;
  }
  return latest;
}

// Is this transcript user entry a tool_result (mid-flow), as opposed to a
// real user message that ends a turn? Within a single Claude turn, every user
// entry in the transcript is a tool_result array — the human's prompt and
// system-injected reminders only appear BETWEEN turns, as plain string content
// or arrays of text blocks. So this single check cleanly separates "ignore
// while collecting" from "this ends the response."
function isToolResultEntry(obj) {
  const msg = obj.message || obj;
  const content = msg.content || obj.content;
  if (!Array.isArray(content)) return false;
  return content.some(b => b && b.type === 'tool_result');
}

// All assistant TEXT entries in the transcript after the cursor, joined.
// Stops at the first non-tool-result user entry (the next-turn boundary).
// Tool-result entries are skipped — they appear mid-turn between Claude's
// tool_use and the next assistant chunk.
// Returns { ts, text } where ts is the last consumed assistant entry's ts
// (used to advance the cursor), or null if nothing found.
function firstAssistantTextAfter(transcriptPath, cursor) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  let raw; try { raw = fs.readFileSync(transcriptPath, 'utf8'); } catch (_) { return null; }

  const parts = [];
  let lastTs = null;
  let collecting = false;

  for (const ln of raw.split('\n')) {
    const t = ln.trim(); if (!t) continue;
    let o; try { o = JSON.parse(t); } catch (_) { continue; }
    const role = o.type || o.role;
    if (role !== 'assistant' && role !== 'user') continue;
    const ts = o.timestamp || o.ts || (o.message && (o.message.created_at || o.message.timestamp)) || null;
    if (!ts) continue;
    if (cursor && ts <= cursor) continue;

    if (role === 'user') {
      if (isToolResultEntry(o)) continue; // mid-flow tool result — keep collecting
      if (collecting) break;              // real user msg ends the response
      continue;                           // user msg before any assistant — skip
    }

    // assistant
    const text = extractAssistantText(o);
    if (!text) continue;
    parts.push(text);
    lastTs = ts;
    collecting = true;
  }

  if (!parts.length) return null;
  return { ts: lastTs, text: parts.join('\n') };
}

// Wait until the transcript stabilizes. Stop fires the same instant the final
// transcript flush is happening, and the polling loop must distinguish "first
// chunk arrived" (incomplete) from "response is fully written" (complete).
// Strategy: poll repeatedly; once a result is found, require it to remain
// unchanged for STABLE_FOR_MS before returning. This catches long working
// responses where the final 1+ KB summary block is written ~hundreds of ms
// after Stop fires.
function waitForFirstAssistantTextAfter(transcriptPath, cursor, maxWaitMs) {
  maxWaitMs = maxWaitMs || 8000;
  const STABLE_FOR_MS = 600;
  const POLL_MS = 100;
  const deadline = Date.now() + maxWaitMs;

  let lastItem = null;
  let stableSince = null;

  // Tight initial poll: spin briefly waiting for first content.
  // Once we have content, switch to "stable for X ms" mode.
  while (Date.now() < deadline) {
    const item = firstAssistantTextAfter(transcriptPath, cursor);
    if (!item) {
      lastItem = null;
      stableSince = null;
    } else if (lastItem && item.ts === lastItem.ts && item.text.length === lastItem.text.length) {
      if (stableSince === null) stableSince = Date.now();
      if (Date.now() - stableSince >= STABLE_FOR_MS) return item;
    } else {
      lastItem = item;
      stableSince = null;
    }
    const wakeAt = Date.now() + POLL_MS;
    while (Date.now() < wakeAt) { /* spin */ }
  }

  return lastItem; // best effort if we hit deadline
}

// v1.8.2: data-driven, FIFO turn matching for Stop.
// The single .current_turn.txt file is racy when UserPromptSubmit for the
// next turn lands before Stop for the previous one (responses end up paired
// with the wrong prompt — observed off-by-one in real sessions).
//
// Stops fire in COMPLETION order. So we want the OLDEST prompt in this
// session that hasn't got a matching response yet — that's the one Stop
// is closing. Walk forward, push opens, pop on response, return head.
function pendingPromptTurnId(session) {
  const nodes = loadNodes();
  const openPrompts = [];
  for (const n of nodes) {
    if ((n.session || 'main') !== session) continue;
    const tags = n.tags || [];
    const tid  = n.turn_id;
    if (!tid) continue;
    if (tags.indexOf('prompt') !== -1) {
      openPrompts.push(tid);
    } else if (tags.indexOf('response') !== -1) {
      const idx = openPrompts.indexOf(tid);
      if (idx !== -1) openPrompts.splice(idx, 1);
    }
  }
  return openPrompts.length ? openPrompts[0] : null;
}

function handleStop(payload) {
  const session = sessionIdOf(payload);
  // 1) Pop the oldest queued turn (FIFO with the corresponding UPS).
  const popped = popPendingTurn(session);
  // turn_id preference order: popped (most accurate) → data scan → file state.
  const tid = (popped && popped.turnId) || pendingPromptTurnId(session) || currentTurnId();
  // 2) Effective cursor = max(global cursor, this turn's lower bound). This
  //    excludes any assistant text that existed BEFORE this turn's UPS, and
  //    anything we've already paired with a previous Stop.
  const globalCursor = readCursor(session);
  const lowerBound = popped && popped.lowerBoundTs ? popped.lowerBoundTs : null;
  let effective = globalCursor || null;
  if (lowerBound && (!effective || lowerBound > effective)) effective = lowerBound;
  // 3) Poll the transcript for assistant text after the cursor. Stop fires the
  //    same instant the final transcript flush is in progress; the polling waits
  //    for the response to STABILIZE (not just appear) so multi-block long
  //    working responses are captured complete rather than truncated to chunk 1.
  const item = waitForFirstAssistantTextAfter(payload.transcript_path, effective);
  let text = null;
  if (item) {
    text = item.text;
    writeCursor(session, item.ts);
  } else {
    text = lastAssistantText(payload.transcript_path);
  }
  let node;
  if (text) {
    const firstLine = text.split('\n', 1)[0].trim();
    const title = firstLine.length > 96
      ? firstLine.slice(0, 96) + '…'
      : (firstLine || 'Claude responded');
    let summary = text.slice(0, 160).replace(/\n/g, ' ').trim();
    if (text.length > 160) summary += '…';
    node = {
      agent: 'orchestrator',
      kind: 'response',
      status: 'completed',
      title,
      summary,
      tags: ['response'],
      session,
      blocks: [{ type: 'markdown', value: text.slice(0, 200000) }],
    };
  } else {
    node = {
      agent: 'orchestrator',
      kind: 'response',
      status: 'completed',
      title: 'Claude responded',
      summary: '(transcript not readable; install path or permission issue)',
      tags: ['response', 'stop'],
      session,
    };
  }
  if (tid) node.turn_id = tid;
  endTurn();
  // Recover any prompts/responses that bypassed UPS/Stop earlier in this
  // session (orchestrator pattern, dropped UPS, etc.). Idempotent — dedup
  // skips anything already captured.
  let derived = [];
  try { derived = deriveCatchUpNodes(payload.transcript_path, session); }
  catch (exc) { logErr(`graph derivation failed: ${exc && exc.message || exc}`); }
  return derived.length ? derived.concat([node]) : node;
}

const HANDLERS = {
  SessionStart: handleSessionStart,
  UserPromptSubmit: handleUserPrompt,
  PreToolUse: handlePreToolUse,
  PostToolUse: handlePostToolUse,
  SubagentStop: handleSubagentStop,
  Stop: handleStop,
};

// ─────────────────────────── Main ────────────────────────────────────────

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) return 0;
  let payload;
  try { payload = JSON.parse(raw); }
  catch (exc) {
    logErr(`malformed hook input: ${exc && exc.message || exc}`);
    return 0;
  }

  const refreshed = bootstrapProject();
  try { registerInHub(payload.session_id); }
  catch (exc) { logErr(`hub registration failed: ${exc && exc.message || exc}`); }

  // If the bootstrap refreshed any viewer file outside SessionStart, also bounce
  // the running server so the user picks up the new files immediately. (The
  // SessionStart handler does the same check via its ctx.refreshed param.)
  const event = payload.hook_event_name || '';
  if (refreshed > 0 && event !== 'SessionStart') {
    try { maybeAutoServe({ force: true }); } catch (_) {}
  }

  const handler = HANDLERS[event];
  if (!handler) return 0;

  let result;
  try { result = handler(payload, { refreshed }); }
  catch (exc) { logErr(`handler error (${event}): ${exc && exc.message || exc}`); return 0; }

  if (!result) return 0;
  const nodeList = Array.isArray(result) ? result : [result];
  for (const node of nodeList) {
    if (!node) continue;
    try { appendNode(node); }
    catch (exc) { logErr(`append error: ${exc && exc.message || exc}`); }
  }

  return 0;
}

process.exit(main());
