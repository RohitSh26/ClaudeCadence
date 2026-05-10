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
  const tid = beginTurn();
  // Push this turn onto the per-session FIFO with the current "lower bound"
  // (latest assistant ts in transcript right now). Stop will pop it later
  // and only consider assistant texts that arrived AFTER this lower bound.
  try {
    pushPendingTurn(
      sessionIdOf(payload),
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
    session: sessionIdOf(payload),
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
    return {
      agent: 'orchestrator',
      kind: 'fork',
      status: 'in_progress',
      title: `Dispatched → ${sub}` + (desc ? `: ${shortStr(desc, 80)}` : ''),
      summary: shortStr(desc || promptPreview, 160),
      tags: ['fork', 'dispatch', String(sub)],
      session: sessionIdOf(payload),
      blocks,
    };
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
    let resultText = '';
    if (tr && typeof tr === 'object') {
      resultText = tr.result || tr.content || '';
    } else if (typeof tr === 'string') {
      resultText = tr;
    }
    resultText = shortStr(resultText, 600);
    const blocks = resultText ? [{ type: 'markdown', value: resultText }] : [];
    return {
      agent: String(sub),
      kind: 'merge',
      status: 'completed',
      title: `${sub} returned`,
      summary: shortStr(resultText, 160) || 'completed',
      tags: ['merge', 'subagent', String(sub)],
      session,
      blocks,
    };
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
    let sizeHint = '';
    if (tr && typeof tr === 'object') {
      const content = tr.content || '';
      if (typeof content === 'string' && content.includes('\n')) {
        sizeHint = ` · ${content.split('\n').length} lines`;
      }
    }
    return {
      agent: 'orchestrator',
      kind: 'tool_call',
      status: 'completed',
      title: `${verb} ${filePath}`,
      summary: sizeHint.replace(/^\s·\s/, '') || '',
      tags: ['file', verb.toLowerCase().split(/\s+/)[0]],
      session,
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
  return {
    agent: String(sub),
    kind: 'merge',
    status: 'completed',
    title: `${sub} done`,
    summary: 'Returned to orchestrator',
    tags: ['subagent', 'stop', String(sub)],
    session,
  };
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

// Extract human-written text from a transcript user entry.
// Returns null for tool results, internal injections, and empty content.
function extractUserPromptText(obj) {
  const msg = obj.message || obj;
  const content = msg.content || obj.content;
  if (typeof content === 'string') return content.trim() || null;
  if (!Array.isArray(content)) return null;
  // Require at least one text block; reject if any block is a tool_result.
  const textBlocks = content.filter(b => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim());
  if (!textBlocks.length) return null;
  if (content.some(b => b && b.type === 'tool_result')) return null;
  return textBlocks.map(b => b.text).join('\n').trim() || null;
}

// All assistant TEXT entries in the transcript after the cursor.
//
// Normal turn: collects all consecutive assistant entries until the next user
// message. Returns { ts, text, interrupts: [] }.
//
// Mid-stream interrupt: if a user message appears between assistant entries AND
// there are still more assistant entries after it (at Stop-fire time the full
// merged response is already in the transcript), that user message is a
// mid-stream interrupt — not the next-turn boundary. In that case we:
//   - record the interrupt as { ts, text } in interrupts[]
//   - continue collecting the remaining assistant entries
// Returns { ts, text, interrupts: [{ts, text}, ...] }.
// The caller (handleStop) emits synthetic prompt nodes from interrupts[].
function firstAssistantTextAfter(transcriptPath, cursor) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  let raw; try { raw = fs.readFileSync(transcriptPath, 'utf8'); } catch (_) { return null; }

  // Parse all relevant entries with ts > cursor in file order.
  const entries = [];
  for (const ln of raw.split('\n')) {
    const t = ln.trim(); if (!t) continue;
    let o; try { o = JSON.parse(t); } catch (_) { continue; }
    const role = o.type || o.role;
    if (role !== 'assistant' && role !== 'user') continue;
    const ts = o.timestamp || o.ts || (o.message && (o.message.created_at || o.message.timestamp)) || null;
    if (!ts) continue;
    if (cursor && ts <= cursor) continue;
    entries.push({ role, ts, obj: o });
  }

  // Find first assistant entry.
  let startIdx = -1;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].role === 'assistant' && extractAssistantText(entries[i].obj)) {
      startIdx = i; break;
    }
  }
  if (startIdx === -1) return null;

  const parts = [];
  const interrupts = [];
  let lastTs = null;

  for (let i = startIdx; i < entries.length; i++) {
    const e = entries[i];
    if (e.role === 'user') {
      // Look ahead: are there more assistant entries after this user entry?
      const hasMoreAssistant = entries.slice(i + 1).some(
        x => x.role === 'assistant' && extractAssistantText(x.obj)
      );
      if (hasMoreAssistant) {
        // Mid-stream interrupt: record it, continue collecting.
        const interruptText = extractUserPromptText(e.obj);
        if (interruptText) interrupts.push({ ts: e.ts, text: interruptText });
      } else {
        break; // normal end-of-response boundary
      }
    } else {
      const text = extractAssistantText(e.obj);
      if (!text) continue;
      parts.push(text);
      if (!lastTs || e.ts > lastTs) lastTs = e.ts;
    }
  }

  if (!parts.length) return null;
  return { ts: lastTs, text: parts.join('\n'), interrupts };
}

function waitForFirstAssistantTextAfter(transcriptPath, cursor, maxWaitMs) {
  maxWaitMs = maxWaitMs || 3000;
  const deadline = Date.now() + maxWaitMs;
  let item = firstAssistantTextAfter(transcriptPath, cursor);
  if (item) return item;
  while (Date.now() < deadline) {
    const wakeAt = Date.now() + 80;
    while (Date.now() < wakeAt) { /* spin */ }
    item = firstAssistantTextAfter(transcriptPath, cursor);
    if (item) return item;
  }
  return null;
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
  // 3) Poll the transcript for assistant text after the cursor.
  //    Stop fires the same second the transcript is being written; wait it out.
  //    item.interrupts carries any mid-stream user prompts (Bug B).
  const item = waitForFirstAssistantTextAfter(payload.transcript_path, effective);
  let text = null;
  let interrupts = [];
  if (item) {
    text = item.text;
    interrupts = item.interrupts || [];
    writeCursor(session, item.ts);
  } else {
    // Last-resort fallback — better something than nothing for the timeline.
    text = lastAssistantText(payload.transcript_path);
  }

  const nodes = [];

  // 4) Emit synthetic prompt nodes for any mid-stream interrupt messages that
  //    weren't captured by UserPromptSubmit (Bug B). Give each a fresh turn_id
  //    so they appear as distinct turns in the timeline rather than orphans.
  for (const intr of interrupts) {
    const intrTid = beginTurn();
    const titleLine = intr.text.split('\n', 1)[0].trim();
    const intrTitle = titleLine.length > 96 ? titleLine.slice(0, 96) + '…' : (titleLine || 'User interrupted');
    let intrSummary = intr.text.slice(0, 160).replace(/\n/g, ' ').trim();
    if (intr.text.length > 160) intrSummary += '…';
    nodes.push({
      agent: 'founder',
      kind: 'response',
      status: 'completed',
      title: intrTitle,
      summary: intrSummary,
      tags: ['prompt', 'synthesized'],
      session,
      ts: intr.ts,
      turn_id: intrTid,
      blocks: [{ type: 'markdown', value: intr.text.slice(0, 200000) }],
    });
  }

  let responseNode;
  if (text) {
    const firstLine = text.split('\n', 1)[0].trim();
    const title = firstLine.length > 96
      ? firstLine.slice(0, 96) + '…'
      : (firstLine || 'Claude responded');
    let summary = text.slice(0, 160).replace(/\n/g, ' ').trim();
    if (text.length > 160) summary += '…';
    responseNode = {
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
    responseNode = {
      agent: 'orchestrator',
      kind: 'response',
      status: 'completed',
      title: 'Claude responded',
      summary: '(transcript not readable; install path or permission issue)',
      tags: ['response', 'stop'],
      session,
    };
  }
  if (tid) responseNode.turn_id = tid;
  nodes.push(responseNode);

  endTurn();
  return nodes;
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
