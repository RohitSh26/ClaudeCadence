/**
 * ClaudeCadence — hub home renderer.
 * Reads /registry.json + per-cadence /c/<slug>/data/nodes.js for node count
 * and last-activity timestamp. Computes status (active/stale/inactive)
 * from nodes.js mtime served via the hub HTTP handler.
 */
(function () {
  'use strict';

  const REFRESH_MS = 10000;
  let activeStatus = 'all';
  let searchQuery = '';
  let registry = { cadences: [] };
  let stats = {};   // slug -> { count, lastTs, status }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function fmtRel(iso) {
    if (!iso) return 'never';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    return `${days}d ago`;
  }

  function statusFor(iso) {
    if (!iso) return 'inactive';
    const d = new Date(iso);
    if (isNaN(d)) return 'inactive';
    const ageMs = Date.now() - d.getTime();
    if (ageMs <= 5 * 60 * 1000) return 'active';
    if (ageMs <= 24 * 60 * 60 * 1000) return 'stale';
    return 'inactive';
  }

  async function loadRegistry() {
    try {
      const r = await fetch('registry.json?_t=' + Date.now());
      if (!r.ok) throw new Error(r.statusText);
      registry = await r.json();
    } catch (err) {
      registry = { cadences: [], _error: String(err) };
    }
  }

  async function loadCadenceStats(c) {
    try {
      const r = await fetch(`c/${encodeURIComponent(c.slug)}/data/nodes.js?_t=` + Date.now());
      if (!r.ok) throw new Error(r.statusText);
      const txt = await r.text();
      const m = txt.match(/window\.TIMELINE_NODES\s*=\s*(\[[\s\S]*\])\s*;/);
      const nodes = m ? JSON.parse(m[1]) : [];
      const lastTs = nodes.length ? nodes[nodes.length - 1].ts : null;
      // Also check Last-Modified header from server as a fallback signal of activity.
      const lm = r.headers.get('last-modified');
      const mtimeIso = lm ? new Date(lm).toISOString() : null;
      const effectiveTs = lastTs || mtimeIso;
      stats[c.slug] = {
        count: nodes.length,
        lastTs: effectiveTs,
        status: statusFor(effectiveTs),
      };
    } catch (err) {
      stats[c.slug] = { count: 0, lastTs: null, status: 'inactive', error: String(err) };
    }
  }

  async function refresh() {
    await loadRegistry();
    await Promise.all((registry.cadences || []).map(loadCadenceStats));
    render();
  }

  function render() {
    const root = document.getElementById('cadence-list');
    const cads = (registry.cadences || []).slice().map(c => ({
      ...c,
      ...(stats[c.slug] || { count: 0, lastTs: null, status: 'inactive' }),
    }));
    cads.sort((a, b) => {
      const ta = a.lastTs || '';
      const tb = b.lastTs || '';
      return tb.localeCompare(ta);  // newest first
    });

    const visible = cads.filter(c => {
      if (activeStatus !== 'all' && c.status !== activeStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const hay = ((c.name || '') + ' ' + (c.path || '') + ' ' + (c.slug || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // counts
    const counts = { all: cads.length, active: 0, stale: 0, inactive: 0 };
    cads.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });

    // summary row
    const sum = document.getElementById('summary-row');
    sum.innerHTML = '';
    [['active', 'active sessions'], ['stale', 'stale (last 24 h)'], ['inactive', 'inactive (older)']].forEach(([k, label]) => {
      const p = el('span', `summary-pill ${k}`);
      p.appendChild(el('span', 'dot'));
      p.appendChild(document.createTextNode(' ' + label + ' '));
      p.appendChild(el('strong', null, String(counts[k] || 0)));
      sum.appendChild(p);
    });

    // status filter chips
    const fStatus = document.getElementById('filter-status');
    fStatus.innerHTML = '<span class="group-label">show</span>';
    Object.entries(counts).forEach(([s, n]) => {
      const chip = el('span', 'chip' + (s === activeStatus ? ' is-active' : ''));
      chip.appendChild(document.createTextNode(s + ' '));
      chip.appendChild(el('span', 'count', String(n)));
      chip.addEventListener('click', () => { activeStatus = s; render(); });
      fStatus.appendChild(chip);
    });

    // header meta
    document.getElementById('updated').textContent = `updated ${new Date().toUTCString().slice(17, 25)} UTC`;
    document.getElementById('hub-path').textContent = '~/.claude/cadence/';

    // list
    root.innerHTML = '';
    if (!visible.length) {
      const empty = el('div', 'empty');
      if (registry._error) {
        empty.textContent = 'Could not load registry.';
        const hint = el('div', 'hint');
        hint.textContent = registry._error;
        empty.appendChild(hint);
      } else if (!cads.length) {
        empty.textContent = 'No cadences registered yet.';
        const hint = el('div', 'hint');
        hint.textContent = 'Open Claude Code in any project — the cadence will register automatically on first hook fire.';
        empty.appendChild(hint);
      } else {
        empty.textContent = 'No cadences match these filters.';
      }
      root.appendChild(empty);
      return;
    }

    visible.forEach(c => {
      const card = el('div', 'cadence-row');
      card.dataset.status = c.status;

      const a = document.createElement('a');
      a.className = 'cadence';
      a.href = `c/${encodeURIComponent(c.slug)}/`;
      a.dataset.status = c.status;
      a.appendChild(el('span', 'lane'));

      const info = el('div', 'info');
      const nameLine = el('div', 'name-line');
      const nm = el('span', 'name', c.name || c.slug);
      nameLine.appendChild(nm);
      if (c.live) {
        const lp = el('span', 'live-pill');
        lp.appendChild(el('span', 'pulse'));
        lp.appendChild(document.createTextNode(' viewer up'));
        nameLine.appendChild(lp);
      }
      info.appendChild(nameLine);
      info.appendChild(el('div', 'path', c.path || ''));
      a.appendChild(info);

      const stat = el('div', 'stat');
      stat.innerHTML = `<strong>${c.count}</strong> nodes<br>last <strong>${fmtRel(c.lastTs)}</strong>`;
      a.appendChild(stat);

      a.appendChild(el('span', 'status-tag', c.status));

      const arrow = el('span', 'arrow');
      arrow.innerHTML = '<svg viewBox="0 0 12 12" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m4 2 4 4-4 4"/></svg>';
      a.appendChild(arrow);

      card.appendChild(a);

      const forget = el('button', 'forget-btn');
      forget.type = 'button';
      forget.title = 'Remove from registry (does not delete files)';
      forget.innerHTML = '<svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m3 3 6 6m-6 0 6-6"/></svg> forget';
      forget.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!confirm(`Forget cadence "${c.name || c.slug}"?\nThe project's .claude/cadence/ files stay on disk; only the hub registry entry is removed.`)) return;
        try {
          await fetch('api/forget?slug=' + encodeURIComponent(c.slug), { method: 'POST' });
        } catch (_) { /* ignore */ }
        delete stats[c.slug];
        await refresh();
      });
      card.appendChild(forget);

      root.appendChild(card);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('search').addEventListener('input', e => {
      searchQuery = e.target.value;
      render();
    });
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('search').focus();
      }
    });
    refresh();
    setInterval(refresh, REFRESH_MS);
  });
})();
