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
      const lm = r.headers.get('last-modified');
      const mtimeIso = lm ? new Date(lm).toISOString() : null;
      const effectiveTs = lastTs || mtimeIso;

      // Group nodes by session id to surface every Claude Code session that
      // ran inside this cadence — the "home page" should drill down to
      // sessions, not just projects.
      const sessionMap = new Map();
      for (const n of nodes) {
        const sid = n.session || 'main';
        let s = sessionMap.get(sid);
        if (!s) {
          s = { id: sid, count: 0, firstTs: n.ts, lastTs: n.ts };
          sessionMap.set(sid, s);
        }
        s.count += 1;
        if (n.ts && (!s.lastTs || n.ts > s.lastTs)) s.lastTs = n.ts;
        if (n.ts && (!s.firstTs || n.ts < s.firstTs)) s.firstTs = n.ts;
      }
      const sessions = Array.from(sessionMap.values())
        .map(s => ({ ...s, status: statusFor(s.lastTs) }))
        .sort((a, b) => (b.lastTs || '').localeCompare(a.lastTs || ''));

      stats[c.slug] = {
        count: nodes.length,
        lastTs: effectiveTs,
        status: statusFor(effectiveTs),
        sessions,
        nodes,   // v2.2: keep nodes for cross-project search + heatmap
      };
    } catch (err) {
      stats[c.slug] = { count: 0, lastTs: null, status: 'inactive', sessions: [], nodes: [], error: String(err) };
    }
  }

  // v2.2: 7×24 activity heatmap of prompts across all cadences.
  // Returns an array of {day, hour, count} for the last 14 days.
  function buildHeatmap() {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const grid = {};                                  // key 'd-h' → count
    for (const slug of Object.keys(stats)) {
      const nodes = stats[slug].nodes || [];
      for (const n of nodes) {
        if (!(n.tags || []).includes('prompt')) continue;  // prompts only
        const t = Date.parse(n.ts);
        if (!Number.isFinite(t) || t < cutoff) continue;
        const d = new Date(t);
        const key = d.getDay() + '-' + d.getHours();
        grid[key] = (grid[key] || 0) + 1;
      }
    }
    return grid;
  }

  function renderHeatmap() {
    const root = document.getElementById('heatmap');
    if (!root) return;
    const grid = buildHeatmap();
    const values = Object.values(grid);
    const max = values.length ? Math.max(...values) : 0;
    if (max === 0) {
      root.innerHTML = '<div class="hm-empty">No prompts in the last 14 days.</div>';
      return;
    }
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    let html = '<div class="hm-grid"><div class="hm-corner"></div>';
    // hour labels (00–23)
    for (let h = 0; h < 24; h++) {
      html += '<div class="hm-h">' + (h % 6 === 0 ? String(h).padStart(2,'0') : '') + '</div>';
    }
    for (let d = 0; d < 7; d++) {
      html += '<div class="hm-d">' + days[d] + '</div>';
      for (let h = 0; h < 24; h++) {
        const count = grid[d + '-' + h] || 0;
        const intensity = count === 0 ? 0 : Math.max(0.18, count / max);
        html += '<div class="hm-cell" style="opacity:' + intensity.toFixed(2) +
                '" title="' + days[d] + ' ' + String(h).padStart(2,'0') + ':00 — ' + count + ' prompt' + (count===1?'':'s') + '"></div>';
      }
    }
    html += '</div>';
    html += '<div class="hm-legend">' +
      '<span>last 14d · ' + values.reduce((a,b)=>a+b,0) + ' prompts</span>' +
      '<span class="hm-scale"><span>less</span>' +
        '<i style="opacity:0.18"></i><i style="opacity:0.4"></i><i style="opacity:0.65"></i><i style="opacity:1"></i>' +
        '<span>more</span></span>' +
      '</div>';
    root.innerHTML = html;
  }

  // v2.2: cross-project content search. Search across all cached cadence
  // nodes' titles + summaries. Return up to 8 results per cadence.
  function searchCrossProject(q) {
    if (!q || q.length < 2) return [];
    const lq = q.toLowerCase();
    const results = [];
    for (const slug of Object.keys(stats)) {
      const nodes = stats[slug].nodes || [];
      const cadName = (registry.cadences || []).find(c => c.slug === slug)?.name || slug;
      const hits = [];
      for (const n of nodes) {
        const hay = ((n.title||'') + ' ' + (n.summary||'')).toLowerCase();
        if (hay.includes(lq)) {
          hits.push(n);
          if (hits.length >= 8) break;
        }
      }
      if (hits.length) results.push({ slug, name: cadName, hits });
    }
    return results;
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

      // Sessions list — drill-down into each Claude Code session that ran
      // inside this cadence. Linked URLs jump straight to the per-project
      // viewer pre-filtered to that session.
      const sess = (c.sessions || []);
      if (sess.length) {
        const slist = el('div', 'session-list');
        const top = sess.slice(0, 6);
        const more = sess.length - top.length;
        top.forEach(s => {
          const row = document.createElement('a');
          row.className = 'session-line';
          row.dataset.status = s.status;
          row.href = `c/${encodeURIComponent(c.slug)}/#session=${encodeURIComponent(s.id)}`;
          row.innerHTML =
            `<span class="lane"></span>` +
            `<span class="id">${(s.id || '').replace(/[<>&"]/g, '')}</span>` +
            `<span class="status-pill">${s.status}</span>` +
            `<span class="meta"><strong>${s.count}</strong> events · ${fmtRel(s.lastTs)}</span>`;
          slist.appendChild(row);
        });
        if (more > 0) {
          const moreRow = el('div', 'session-line is-more');
          moreRow.textContent = `+${more} more session${more === 1 ? '' : 's'}`;
          slist.appendChild(moreRow);
        }
        card.appendChild(slist);
      }

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

    // v2.2: heatmap + cross-project search results
    renderHeatmap();
    renderSearchResults();
  }

  function renderSearchResults() {
    const root = document.getElementById('search-results');
    if (!root) return;
    if (!searchQuery || searchQuery.length < 2) {
      root.innerHTML = '';
      root.classList.remove('is-active');
      return;
    }
    const results = searchCrossProject(searchQuery);
    if (!results.length) {
      root.innerHTML = '<div class="sr-empty">No matches in session content.</div>';
      root.classList.add('is-active');
      return;
    }
    const totalHits = results.reduce((s, r) => s + r.hits.length, 0);
    let html = '<div class="sr-head">' + totalHits + ' match' + (totalHits===1?'':'es') +
               ' across ' + results.length + ' cadence' + (results.length===1?'':'s') + '</div>';
    for (const r of results) {
      html += '<div class="sr-group"><div class="sr-group-head">' + escapeHtml(r.name) +
              '<span class="sr-count">' + r.hits.length + '</span></div>';
      for (const n of r.hits) {
        html += '<a class="sr-hit" href="c/' + encodeURIComponent(r.slug) + '/#' + encodeURIComponent(n.id||'') + '">' +
                '<span class="sr-when">' + fmtRel(n.ts) + '</span>' +
                '<span class="sr-title">' + escapeHtml((n.title||'').slice(0,120)) + '</span>' +
                '</a>';
      }
      html += '</div>';
    }
    root.innerHTML = html;
    root.classList.add('is-active');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
