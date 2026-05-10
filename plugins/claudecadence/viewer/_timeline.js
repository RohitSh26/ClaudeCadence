/**
 * Timeline renderer · iter 2.
 *
 * Markup matches Claude Design's iter-2 mocks (mocks/01-single-linear.html
 * and mocks/06-graph-blocks.html). Compact-when-closed cards, stats ribbon,
 * failure banner, view-mode toggle, full chart-block vocabulary.
 */
(function () {
  'use strict';

  const AGENT_LANE = {
    'orchestrator':   'var(--lane-trunk)',
    'founder':        'var(--apricot-600)',
    'ui-agent':       'var(--lane-success)',
    'backend-agent':  'var(--lane-info)',
    'infra-agent':    'var(--lane-success)',
    'eval-agent':     'var(--lane-warning)',
    'external':       'var(--lane-warning)',
  };

  const STATUS_LABEL = {
    'in_progress': 'in-progress',
    'completed':   'completed',
    'failed':      'failed',
    'blocked':     'blocked',
    'decision':    'decision',
  };

  const STATUS_COLOR = {
    'in_progress': 'var(--info)',
    'completed':   'var(--success)',
    'failed':      'var(--danger)',
    'blocked':     'var(--warning)',
    'decision':    'var(--apricot-600)',
  };

  let activeStatus  = 'all';
  let activeAgent   = 'all';
  let activeSession = 'all';      // v1.3: session filter
  let activeMode    = 'full';      // full · summary · compact · events
  let searchQuery   = '';
  let activeSessionForView = null; // v1.5: which session is in the detail pane

  // ─────────── DOM helpers ───────────
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function laneVar(agent) { return AGENT_LANE[agent] || 'var(--lane-trunk)'; }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function chevronSvg() {
    return '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m4 2 4 4-4 4"/></svg>';
  }
  function iso(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d)) return ts;
    return ts.replace('Z','').replace('T',' ').slice(0, 19) + 'Z';
  }
  function shortTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d)) return ts;
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  }
  function rel(ts) {
    if (!ts) return '';
    const d = new Date(ts); if (isNaN(d)) return '';
    const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }
  function simpleMd(s) {
    let h = escapeHtml(s);
    h = h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
    h = h.replace(/\*(.+?)\*/g,'<em>$1</em>');
    h = h.replace(/`([^`]+)`/g,'<code>$1</code>');
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
    const lines = h.split('\n');
    let out = []; let inUl = false;
    for (const ln of lines) {
      if (/^- /.test(ln)) {
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push('<li>' + ln.replace(/^- /, '') + '</li>');
      } else {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (ln.trim()) out.push('<p>' + ln + '</p>');
      }
    }
    if (inUl) out.push('</ul>');
    return out.join('\n');
  }
  function fmtElapsed(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  // ─────────── Block renderers ───────────
  const renderers = {
    markdown:     renderMarkdown,
    table:        renderTable,
    code:         renderCode,
    diagram:      renderDiagram,
    chart:        renderSparkline,           // legacy alias
    sparkline:    renderSparkline,
    bar:          renderBar,
    line:         renderLine,
    area:         renderArea,
    distribution: renderDistribution,
    status_grid:  renderStatusGrid,
    agent_heatmap:renderHeatmap,
    progress_arc: renderProgressArc,
    lane_flow:    renderLaneFlow,
    delta_bar:    renderDeltaBar,
    checklist:    renderChecklist,
    decision:     renderDecision,
    link:         renderLink,
    key_value:    renderKeyValue,
  };

  function blockLabel(text, meta) {
    const div = el('div','block-label');
    div.textContent = text;
    if (meta) {
      const m = el('span','meta',meta);
      div.appendChild(m);
    }
    return div;
  }

  function renderMarkdown(b) {
    const div = el('div','block md');
    if (b.label) div.appendChild(blockLabel(b.label));
    const body = el('div'); body.innerHTML = simpleMd(b.value || '');
    div.appendChild(body);
    return div;
  }
  function renderTable(b) {
    const div = el('div','block table');
    if (b.label) div.appendChild(blockLabel(b.label));
    let html = '<table>';
    if (b.headers) {
      html += '<thead><tr>';
      b.headers.forEach(h => html += `<th>${escapeHtml(h)}</th>`);
      html += '</tr></thead>';
    }
    html += '<tbody>';
    (b.rows || []).forEach(r => {
      html += '<tr>';
      r.forEach(c => html += `<td>${escapeHtml(c)}</td>`);
      html += '</tr>';
    });
    html += '</tbody></table>';
    const wrap = el('div'); wrap.innerHTML = html;
    div.appendChild(wrap.firstChild);
    return div;
  }
  function renderCode(b) {
    const div = el('div','block code');
    if (b.lang) {
      const t = el('div','lang-tag'); t.textContent = b.lang; div.appendChild(t);
    }
    const pre = el('pre'); pre.textContent = b.value || '';
    div.appendChild(pre);
    return div;
  }
  function renderDiagram(b) {
    const div = el('div','block diagram');
    if (b.label) div.appendChild(blockLabel(b.label));
    div.innerHTML += b.svg || '';
    return div;
  }
  function renderSparkline(b) {
    const div = el('div','block chart-block sparkline');
    const series = b.series || [];
    const max = Math.max(...series.map(p => p.y ?? p.value ?? 0), 1);
    const min = Math.min(...series.map(p => p.y ?? p.value ?? 0), 0);
    const w = 280, h = 44;
    const pts = series.map((p, i) => {
      const x = (i / Math.max(series.length - 1, 1)) * w;
      const v = p.y ?? p.value ?? 0;
      const y = h - ((v - min) / Math.max(max - min, 1)) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    let html = `<div class="stat"><span class="v tabular">${escapeHtml(b.kpi || '')}</span>`;
    if (b.label) html += `<span class="l">${escapeHtml(b.label)}</span>`;
    html += '</div>';
    html += `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">`;
    html += `<polyline fill="none" stroke="var(--mid)" stroke-width="1.4" points="${pts}"/>`;
    if (series.length) {
      const last = series[series.length - 1];
      const lv = last.y ?? last.value ?? 0;
      const ly = h - ((lv - min) / Math.max(max - min, 1)) * h;
      html += `<circle cx="${w}" cy="${ly.toFixed(1)}" r="2.6" fill="var(--apricot-500)"/>`;
    }
    html += `<line x1="0" y1="${h-2}" x2="${w}" y2="${h-2}" stroke="var(--soft)" stroke-width="0.5"/></svg>`;
    div.innerHTML = html;
    return div;
  }
  function renderBar(b) {
    const div = el('div','block chart-block bar');
    if (b.label) div.appendChild(blockLabel(b.label));
    const cats = b.categories || []; const vals = b.values || [];
    const max = Math.max(...vals, 1);
    const rows = el('div','rows');
    cats.forEach((c, i) => {
      const v = vals[i] || 0;
      const row = el('div','row');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '120px 1fr 50px';
      row.style.gap = '8px';
      row.style.alignItems = 'center';
      row.style.fontSize = '12px';
      row.style.padding = '4px 0';
      const lab = el('span','row-label'); lab.textContent = c;
      const track = el('div','row-track'); track.style.background = 'var(--bone)'; track.style.height = '8px'; track.style.borderRadius = '2px';
      const fill = el('div','row-fill'); fill.style.background = 'var(--apricot-500)'; fill.style.width = ((v/max)*100)+'%'; fill.style.height = '100%'; fill.style.borderRadius = '2px';
      track.appendChild(fill);
      const val = el('span','row-value tabular'); val.textContent = v + (b.unit ? ' '+b.unit : '');
      row.appendChild(lab); row.appendChild(track); row.appendChild(val);
      rows.appendChild(row);
    });
    div.appendChild(rows);
    return div;
  }
  function renderLine(b) {
    const div = el('div','block chart-block line');
    if (b.label) div.appendChild(blockLabel(b.label));
    const series = b.series || [];
    const w = 480, h = 120, pad = 8;
    let html = `<div class="plot" style="background:var(--paper);border:1px solid var(--soft);border-radius:6px;padding:10px;">`;
    html += `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:120px;">`;
    series.forEach((s, idx) => {
      const vals = s.values || [];
      const max = Math.max(...vals, 1);
      const pts = vals.map((v, i) => {
        const x = pad + (i / Math.max(vals.length - 1, 1)) * (w - 2*pad);
        const y = h - pad - (v / max) * (h - 2*pad);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      const stroke = ['var(--apricot-600)','var(--info)','var(--success)'][idx] || 'var(--mid)';
      html += `<polyline fill="none" stroke="${stroke}" stroke-width="1.5" points="${pts}"/>`;
    });
    html += '</svg></div>';
    div.innerHTML += html;
    return div;
  }
  function renderArea(b) {
    const out = renderLine(b);
    out.classList.remove('line'); out.classList.add('area');
    return out;
  }
  function renderDistribution(b) {
    const div = el('div','block chart-block distribution');
    if (b.label) div.appendChild(blockLabel(b.label));
    const bins = b.bins || (b.raw ? bucketize(b.raw, 12) : []);
    const max = Math.max(...bins.map(x => x.count || 0), 1);
    let html = '<svg viewBox="0 0 320 100" preserveAspectRatio="none" style="width:100%;height:100px;">';
    const w = 320 / Math.max(bins.length, 1);
    bins.forEach((bin, i) => {
      const h = (bin.count / max) * 92;
      html += `<rect x="${(i*w + 1).toFixed(1)}" y="${(96-h).toFixed(1)}" width="${(w-2).toFixed(1)}" height="${h.toFixed(1)}" fill="var(--apricot-500)" opacity="0.85"/>`;
    });
    html += '</svg>';
    div.innerHTML += html;
    return div;
  }
  function bucketize(raw, n) {
    if (!raw.length) return [];
    const min = Math.min(...raw), max = Math.max(...raw), step = (max - min) / n || 1;
    const bins = Array.from({length: n}, (_, i) => ({ x: min + i*step, count: 0 }));
    raw.forEach(v => {
      const idx = Math.min(n-1, Math.floor((v - min) / step));
      bins[idx].count++;
    });
    return bins;
  }
  function renderStatusGrid(b) {
    const div = el('div','block chart-block status-grid');
    if (b.label) div.appendChild(blockLabel(b.label));
    const cells = b.cells || [];
    const grid = el('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${cells[0]?.length || 1}, 14px)`;
    grid.style.gap = '3px';
    cells.flat().forEach(s => {
      const c = el('div'); c.style.width = '14px'; c.style.height = '14px';
      c.style.borderRadius = '2px';
      c.style.background = STATUS_COLOR[s] || 'var(--neutral-300)';
      c.title = s;
      grid.appendChild(c);
    });
    div.appendChild(grid);
    return div;
  }
  function renderHeatmap(b) {
    const div = el('div','block chart-block heatmap');
    if (b.label) div.appendChild(blockLabel(b.label));
    const agents = b.agents || []; const buckets = b.buckets || []; const matrix = b.matrix || [];
    const max = Math.max(...matrix.flat(), 1);
    const wrap = el('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = `120px repeat(${buckets.length}, 1fr)`;
    wrap.style.gap = '2px';
    wrap.style.fontFamily = 'var(--font-mono)';
    wrap.style.fontSize = '10px';
    // header
    wrap.appendChild(el('div',null,''));
    buckets.forEach(bk => { const h = el('div'); h.style.color = 'var(--mid)'; h.textContent = bk; wrap.appendChild(h); });
    agents.forEach((a, i) => {
      const lab = el('div'); lab.textContent = a; lab.style.color = 'var(--ink)'; wrap.appendChild(lab);
      (matrix[i] || []).forEach(v => {
        const c = el('div'); c.style.height = '14px'; c.style.borderRadius = '2px';
        const op = (v / max).toFixed(2);
        c.style.background = `color-mix(in oklch, var(--apricot-500) ${Math.round(op*100)}%, var(--bone))`;
        c.title = `${a} · ${v}`;
        wrap.appendChild(c);
      });
    });
    div.appendChild(wrap);
    return div;
  }
  function renderProgressArc(b) {
    const div = el('div','block chart-block progress-arc');
    if (b.label) div.appendChild(blockLabel(b.label));
    const v = b.value || 0, max = b.max || 100;
    const pct = Math.min(1, v / max);
    const r = 32, c = 2 * Math.PI * r;
    div.innerHTML += `
      <div style="display:flex;align-items:center;gap:14px;">
        <svg viewBox="0 0 80 80" style="width:80px;height:80px;">
          <circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--bone)" stroke-width="6"/>
          <circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--apricot-500)" stroke-width="6"
                  stroke-dasharray="${(c*pct).toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round"
                  transform="rotate(-90 40 40)"/>
          <text x="40" y="44" text-anchor="middle" font-family="var(--font-mono)" font-size="14" fill="var(--ink)">${Math.round(pct*100)}%</text>
        </svg>
        <div><div style="font-family:var(--font-mono);font-size:12px;color:var(--ink);">${v} / ${max}</div>
        ${b.label ? `<div style="font-size:11px;color:var(--mid);">${escapeHtml(b.label)}</div>` : ''}</div>
      </div>`;
    return div;
  }
  function renderLaneFlow(b) {
    const div = el('div','block chart-block lane-flow');
    if (b.label) div.appendChild(blockLabel(b.label));
    const from = b.from || []; const to = b.to || []; const values = b.values || [];
    const total = values.reduce((a, v) => a + v, 0) || 1;
    const wrap = el('div');
    wrap.style.padding = '8px 0';
    from.forEach((f, i) => {
      const row = el('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '90px 1fr 90px';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.fontFamily = 'var(--font-mono)';
      row.style.fontSize = '11px';
      row.style.padding = '3px 0';
      const lf = el('div'); lf.textContent = f; lf.style.color = 'var(--mid)';
      const bar = el('div'); bar.style.height = '12px'; bar.style.background = 'var(--bone)'; bar.style.borderRadius = '2px'; bar.style.position = 'relative';
      const fill = el('div'); fill.style.height = '100%'; fill.style.background = 'var(--apricot-500)';
      fill.style.width = ((values[i] / total) * 100).toFixed(1) + '%';
      fill.style.borderRadius = '2px';
      bar.appendChild(fill);
      const lt = el('div'); lt.textContent = (to[i] || '') + ` · ${values[i]}`; lt.style.color = 'var(--ink)';
      row.appendChild(lf); row.appendChild(bar); row.appendChild(lt);
      wrap.appendChild(row);
    });
    div.appendChild(wrap);
    return div;
  }
  function renderDeltaBar(b) {
    const div = el('div','block chart-block delta-bar');
    const before = b.before || 0, after = b.after || 0;
    const delta = after - before;
    const dir = delta >= 0 ? '↑' : '↓';
    const col = delta >= 0 ? 'var(--success)' : 'var(--danger)';
    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;font-family:var(--font-mono);">
        <div style="display:flex;flex-direction:column;gap:2px;">
          <span style="color:var(--mid);font-size:10px;text-transform:uppercase;letter-spacing:0.06em;">before</span>
          <span style="font-size:18px;color:var(--ink);">${escapeHtml(String(before))}${b.unit ? ' '+escapeHtml(b.unit) : ''}</span>
        </div>
        <div style="font-size:24px;color:${col};">${dir}</div>
        <div style="display:flex;flex-direction:column;gap:2px;">
          <span style="color:var(--mid);font-size:10px;text-transform:uppercase;letter-spacing:0.06em;">after</span>
          <span style="font-size:18px;color:var(--ink);">${escapeHtml(String(after))}${b.unit ? ' '+escapeHtml(b.unit) : ''}</span>
        </div>
        <div style="margin-left:auto;color:${col};font-size:13px;">${dir} ${escapeHtml(String(Math.abs(delta)))} ${b.label ? escapeHtml(b.label) : ''}</div>
      </div>`;
    return div;
  }
  function renderChecklist(b) {
    const div = el('div','block checklist');
    if (b.label) div.appendChild(blockLabel(b.label, b.meta));
    const ul = el('ul');
    (b.items || []).forEach(it => {
      const li = el('li', it.done ? 'done' : null);
      const box = el('span','box', it.done ? '✓' : '');
      const lab = el('span'); lab.textContent = it.label || '';
      li.appendChild(box); li.appendChild(lab);
      ul.appendChild(li);
    });
    div.appendChild(ul);
    return div;
  }
  function renderDecision(b) {
    const div = el('div','block decision');
    const dlabel = el('div','dlabel');
    dlabel.innerHTML = `<span>decision</span><span class="verdict">${b.chosen ? 'CHOSEN' : 'OPEN'}</span>`;
    div.appendChild(dlabel);
    if (b.question) {
      const t = el('div','dtitle'); t.textContent = b.question; div.appendChild(t);
    }
    const opts = el('div','doptions');
    (b.options || []).forEach(opt => {
      const o = el('div', opt === b.chosen ? 'opt chosen' : 'opt');
      o.appendChild(el('div','opt-name', opt === b.chosen ? 'chosen' : 'option'));
      o.appendChild(el('div','opt-text', opt));
      opts.appendChild(o);
    });
    div.appendChild(opts);
    return div;
  }
  function renderLink(b) {
    const div = el('div','block link');
    const a = el('a'); a.href = b.href || '#'; a.target = '_blank'; a.rel = 'noopener';
    a.innerHTML = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 3H3v6h6V7"/><path d="M7 2h3v3"/><path d="m6 6 4-4"/></svg>' + escapeHtml(b.label || b.href || '');
    div.appendChild(a);
    return div;
  }
  function renderKeyValue(b) {
    const dl = el('dl','block kv');
    if (b.label) {
      const lab = el('div','block-label');
      lab.style.gridColumn = '1/-1';
      lab.style.paddingLeft = '0';
      lab.style.borderLeft = 'none';
      lab.textContent = b.label;
      dl.appendChild(lab);
    }
    (b.rows || []).forEach(r => {
      const dt = el('dt'); dt.textContent = r.key;
      const dd = el('dd'); dd.textContent = r.value;
      dl.appendChild(dt); dl.appendChild(dd);
    });
    return dl;
  }

  // ─────────── Node renderer ───────────
  function renderNode(node) {
    const li = el('li','node');
    li.dataset.id = node.id;
    li.dataset.kind = node.kind || 'response';
    li.dataset.agent = node.agent || '';
    if (node.id) li.id = node.id;
    li.style.setProperty('--lane', laneVar(node.agent));

    const rail = el('div','rail');
    const marker = el('div','marker is-filled');
    if (node.status === 'in_progress') marker.classList.add('is-active');
    if (node.status === 'failed')   marker.style.setProperty('--lane', 'var(--danger)');
    if (node.status === 'decision') marker.style.setProperty('--lane', 'var(--apricot-600)');
    rail.appendChild(marker);
    li.appendChild(rail);

    const card = document.createElement('details');
    card.className = 'card';
    const status = node.status || 'completed';
    card.dataset.status = status === 'in_progress' ? 'in-progress' : status;
    if (status === 'in_progress') card.classList.add('is-active');
    if (status === 'in_progress' || status === 'decision') card.open = true;

    // ─── Summary (single compact row when closed) ───
    const sum = document.createElement('summary');
    sum.appendChild(el('span','lane-mark'));
    const h3 = el('h3','title'); h3.textContent = node.title || '(untitled)'; sum.appendChild(h3);

    const tag = el('span','status-tag');
    tag.appendChild(el('span','dot'));
    tag.appendChild(document.createTextNode(STATUS_LABEL[status] || status));
    sum.appendChild(tag);

    const tm = el('span','time');
    tm.innerHTML = `<time>${escapeHtml(shortTime(node.ts))}</time> <span class="rel">· ${escapeHtml(rel(node.ts))}</span>`;
    sum.appendChild(tm);

    const chev = el('span','chevron'); chev.innerHTML = chevronSvg();
    sum.appendChild(chev);
    card.appendChild(sum);

    // ─── Meta line (visible only when [open]) ───
    const meta = el('div','meta-line');
    const agent = el('span','agent-pill'); agent.style.setProperty('--lane', laneVar(node.agent));
    agent.appendChild(el('span','swatch'));
    agent.appendChild(document.createTextNode(' ' + (node.agent || '?')));
    if (node.session && node.session !== 'main') {
      const sid = el('span','id'); sid.textContent = node.session; agent.appendChild(sid);
    }
    meta.appendChild(agent);
    const st = el('span','status ' + (status === 'in_progress' ? 'in-progress' : status));
    if (status === 'in_progress') {
      st.appendChild(el('span','inline-dot'));
      st.appendChild(document.createTextNode(STATUS_LABEL[status]));
    } else {
      st.textContent = STATUS_LABEL[status] || status;
    }
    meta.appendChild(st);
    const isoT = el('span','iso-time');
    isoT.innerHTML = `<time>${escapeHtml(node.ts || '')}</time> <span class="rel">${escapeHtml(rel(node.ts))} ago</span>`;
    meta.appendChild(isoT);
    if (node.kind === 'fork' || node.kind === 'merge') {
      const k = el('span','status decision'); k.textContent = node.kind; meta.appendChild(k);
    }
    if (node.tags && node.tags.length) {
      const tagWrap = el('span');
      tagWrap.style.cssText = 'display:inline-flex;gap:4px;flex-wrap:wrap;margin-left:auto;';
      node.tags.forEach(t => {
        const p = el('span');
        p.style.cssText = 'font-family:var(--font-mono);font-size:10px;color:var(--mid);background:var(--bone);padding:1px 6px;border-radius:3px;border:1px solid var(--soft);';
        p.textContent = '#' + t;
        tagWrap.appendChild(p);
      });
      meta.appendChild(tagWrap);
    }
    card.appendChild(meta);

    // ─── Lede (visible only when [open]) ───
    if (node.summary) {
      const lede = el('div','titles-open');
      const p = el('p','lede'); p.textContent = node.summary;
      lede.appendChild(p);
      card.appendChild(lede);
    }

    // ─── Body (rich blocks, only when [open]) ───
    if (node.blocks && node.blocks.length) {
      const body = el('div','body');
      const blocks = el('div','blocks');
      node.blocks.forEach(b => {
        const r = renderers[b.type];
        if (r) blocks.appendChild(r(b));
        else blocks.appendChild(el('div','block', '⚠ unknown block type: ' + b.type));
      });
      body.appendChild(blocks);
      card.appendChild(body);
    }

    li.appendChild(card);
    return li;
  }

  // ─────────── Stats ribbon ───────────
  function renderStatsRibbon(nodes) {
    const root = document.getElementById('stats-ribbon');
    if (!root) return;
    if (!nodes.length) { root.style.display = 'none'; return; }
    const decisions = nodes.filter(n => n.status === 'decision' || n.kind === 'decision').length;
    const failures  = nodes.filter(n => n.status === 'failed').length;
    const agents    = new Set(nodes.map(n => n.agent)).size;
    const first = new Date(nodes[0].ts), last = new Date(nodes[nodes.length-1].ts);
    const elapsedMs = isNaN(first) || isNaN(last) ? 0 : (last - first);
    const elapsed = fmtElapsed(elapsedMs);
    const lastFail = nodes.filter(n => n.status === 'failed').slice(-1)[0];
    const throughput = elapsedMs > 0
      ? (nodes.length / (elapsedMs / 60000)).toFixed(2)
      : '—';
    root.innerHTML = `
      <div class="stat">
        <span class="label"><span class="swatch" style="background: var(--lane-trunk)"></span>nodes</span>
        <span class="v tabular">${nodes.length}</span>
        <span class="sub">over ${elapsed}</span>
      </div>
      <div class="stat">
        <span class="label"><span class="swatch" style="background: var(--apricot-600)"></span>decisions</span>
        <span class="v tabular">${decisions}</span>
        <span class="sub">${decisions ? 'last @ ' + shortTime(nodes.filter(n=>n.status==='decision').slice(-1)[0]?.ts) : 'none yet'}</span>
      </div>
      <div class="stat">
        <span class="label"><span class="swatch" style="background: var(--info)"></span>elapsed</span>
        <span class="v tabular">${elapsed}</span>
        <span class="sub">window ${shortTime(nodes[0].ts)} → ${shortTime(nodes[nodes.length-1].ts)}</span>
      </div>
      <div class="stat">
        <span class="label"><span class="swatch" style="background: var(--lane-graphite)"></span>agents</span>
        <span class="v tabular">${agents}</span>
        <span class="sub">${[...new Set(nodes.map(n=>n.agent))].join(' · ')}</span>
      </div>
      <div class="stat ${failures ? 'is-danger' : ''}">
        <span class="label"><span class="swatch" style="background: var(--danger)"></span>failures</span>
        <span class="v tabular">${failures}</span>
        <span class="sub">${lastFail ? 'last @ ' + shortTime(lastFail.ts) : 'none'}</span>
      </div>
      <div class="stat">
        <span class="label"><span class="swatch" style="background: var(--success)"></span>throughput</span>
        <span class="v tabular">${throughput}<span class="unit">n/m</span></span>
        <span class="sub">avg over window</span>
      </div>`;
    root.style.display = '';
  }

  // ─────────── Failure banner ───────────
  function renderFailureBanner(nodes) {
    const mount = document.getElementById('failure-banner-mount');
    const lastFail = nodes.filter(n => n.status === 'failed').slice(-1)[0];
    const app = document.getElementById('app');
    if (!lastFail) {
      mount.innerHTML = '';
      app.classList.remove('has-banner');
      document.getElementById('app-header').classList.remove('has-banner');
      return;
    }
    app.classList.add('has-banner');
    document.getElementById('app-header').classList.add('has-banner');
    mount.innerHTML = `
      <div class="failure-banner" role="alert">
        <span class="icon">
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="6"/><path d="M7 4v3.5M7 9.6v.4"/></svg>
        </span>
        <strong>Latest failure</strong>
        <span class="ts">at ${escapeHtml(shortTime(lastFail.ts))} UTC · ${escapeHtml(rel(lastFail.ts))} ago</span>
        <span style="opacity:0.7">— ${escapeHtml(lastFail.title || '')}</span>
        <button class="nav-link" onclick="document.getElementById('${escapeHtml(lastFail.id)}')?.scrollIntoView({behavior:'smooth',block:'center'})">jump ↓</button>
        <button class="dismiss" onclick="this.parentElement.remove(); document.getElementById('app').classList.remove('has-banner'); document.getElementById('app-header').classList.remove('has-banner');" aria-label="dismiss">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m3 3 6 6m-6 0 6-6"/></svg>
        </button>
      </div>`;
  }

  // ─────────── Filters ───────────
  function buildFilters() {
    const nodes = window.TIMELINE_NODES || [];
    const statusBox  = document.getElementById('filter-status');
    const agentBox   = document.getElementById('filter-agent');
    const sessionBox = document.getElementById('filter-session');

    const statusCounts = { all: nodes.length };
    nodes.forEach(n => {
      const s = n.status || 'completed';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    statusBox.innerHTML = '<span class="group-label">status</span>';
    Object.keys(statusCounts).forEach(s => {
      const chip = el('span','chip' + (s === activeStatus ? ' is-active' : ''));
      if (s !== 'all') {
        chip.style.color = STATUS_COLOR[s] || 'var(--mid)';
        chip.appendChild(el('span','dot'));
      }
      chip.appendChild(document.createTextNode(' ' + (STATUS_LABEL[s] || s) + ' '));
      chip.appendChild(el('span','count', statusCounts[s]));
      chip.addEventListener('click', () => { activeStatus = s; render(); });
      statusBox.appendChild(chip);
    });

    const agentCounts = { all: nodes.length };
    nodes.forEach(n => {
      const a = n.agent || 'unknown';
      agentCounts[a] = (agentCounts[a] || 0) + 1;
    });
    agentBox.innerHTML = '<span class="group-label">agent</span>';
    Object.keys(agentCounts).forEach(a => {
      const chip = el('span','chip' + (a === activeAgent ? ' is-active' : ''));
      if (a !== 'all') {
        chip.style.setProperty('--lane', laneVar(a));
        chip.style.color = laneVar(a);
        const sw = el('span','swatch');
        sw.style.cssText = 'background: currentColor;';
        chip.appendChild(sw);
      }
      chip.appendChild(document.createTextNode(' ' + a + ' '));
      chip.appendChild(el('span','count', agentCounts[a]));
      chip.addEventListener('click', () => { activeAgent = a; render(); });
      agentBox.appendChild(chip);
    });

    // Session filter chips — only render when there's more than one session.
    const sessionCounts = { all: nodes.length };
    nodes.forEach(n => {
      const s = n.session || 'main';
      sessionCounts[s] = (sessionCounts[s] || 0) + 1;
    });
    const distinctSessions = Object.keys(sessionCounts).filter(k => k !== 'all');
    if (sessionBox) {
      if (distinctSessions.length > 1) {
        sessionBox.style.display = '';
        sessionBox.innerHTML = '<span class="group-label">session</span>';
        Object.keys(sessionCounts).forEach(s => {
          const chip = el('span','chip' + (s === activeSession ? ' is-active' : ''));
          if (s !== 'all') chip.appendChild(el('span','dot'));
          chip.appendChild(document.createTextNode(' ' + s + ' '));
          chip.appendChild(el('span','count', sessionCounts[s]));
          chip.addEventListener('click', () => { activeSession = s; render(); });
          sessionBox.appendChild(chip);
        });
      } else {
        sessionBox.style.display = 'none';
        sessionBox.innerHTML = '';
      }
    }
  }

  function matches(n) {
    if (activeStatus !== 'all' && n.status !== activeStatus) return false;
    if (activeAgent  !== 'all' && n.agent  !== activeAgent)  return false;
    if (activeSession !== 'all' && (n.session || 'main') !== activeSession) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const hay = ((n.title||'') + ' ' + (n.summary||'') + ' ' + (n.tags||[]).join(' ')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  // ─────────── Multi-session render (v1.5: sidebar + detail pane) ───────────
  // Multi-column doesn't scale — three sessions and the screen is unreadable.
  // Instead: a left sidebar listing every session in this project (active /
  // stale / inactive), a single detail pane on the right showing the
  // selected session's full timeline. Same shape Linear, Slack, GitHub use
  // for N parallel things. Scales to 3 or 30 the same way.
  function classifySessionStatus(lastTs) {
    if (!lastTs) return 'inactive';
    const ms = Date.now() - new Date(lastTs).getTime();
    if (isNaN(ms)) return 'inactive';
    if (ms < 5 * 60 * 1000)        return 'active';
    if (ms < 24 * 60 * 60 * 1000)  return 'stale';
    return 'inactive';
  }

  function buildSessionMeta(nodes, sid) {
    const sNodes = nodes.filter(n => (n.session || 'main') === sid);
    const firstTs = sNodes[0]?.ts || '';
    const lastTs  = sNodes[sNodes.length - 1]?.ts || '';
    const turnsHere = new Set(sNodes.map(n => n.turn_id).filter(Boolean));
    const failures = sNodes.filter(n => n.status === 'failed').length;
    const firstPrompt = sNodes.find(n => isPromptNode(n));
    return {
      id: sid,
      nodes: sNodes,
      firstTs,
      lastTs,
      turns: turnsHere.size,
      events: sNodes.length,
      failures,
      status: classifySessionStatus(lastTs),
      firstPromptText: firstPrompt?.title || '',
    };
  }

  function renderMultiSession(root, nodes, sessionIds) {
    const sessions = sessionIds.map(sid => buildSessionMeta(nodes, sid));
    const statusOrder = { active: 0, stale: 1, inactive: 2 };
    sessions.sort((a, b) => {
      const so = statusOrder[a.status] - statusOrder[b.status];
      if (so !== 0) return so;
      return (b.lastTs || '').localeCompare(a.lastTs || '');
    });

    if (!activeSessionForView || !sessions.find(s => s.id === activeSessionForView)) {
      activeSessionForView = sessions[0]?.id || null;
    }

    const shell = el('div','viewer-shell is-multi');

    const sidebar = el('aside','session-sidebar');
    const head = el('div','head');
    const lab = el('span','label'); lab.textContent = 'sessions';
    const cnt = el('span','count'); cnt.textContent = sessions.length;
    head.appendChild(lab); head.appendChild(cnt);
    sidebar.appendChild(head);

    const list = el('ul');
    sessions.forEach(s => {
      const row = el('li','session-row');
      row.dataset.session = s.id;
      row.dataset.status  = s.status;
      if (s.id === activeSessionForView) row.classList.add('is-selected');

      row.appendChild(el('div','lane-stripe'));

      const body = el('div','body');
      const titleLine = el('div','title-line');
      const idEl = el('span','id'); idEl.textContent = s.id;
      titleLine.appendChild(idEl);
      const pill = el('span','status-pill'); pill.textContent = s.status;
      titleLine.appendChild(pill);
      body.appendChild(titleLine);

      const meta = el('div','meta');
      const failsHtml = s.failures
        ? `<span style="color:var(--danger)"><strong>${s.failures}</strong> fails</span>`
        : '';
      meta.innerHTML =
        `<span><strong>${s.turns || '—'}</strong> turns</span>` +
        `<span><strong>${s.events}</strong> events</span>` +
        `<span>${escapeHtml(rel(s.lastTs))} ago</span>` +
        failsHtml;
      body.appendChild(meta);

      if (s.firstPromptText) {
        const fp = el('div','first-prompt');
        fp.textContent = s.firstPromptText;
        body.appendChild(fp);
      }
      row.appendChild(body);

      row.addEventListener('click', () => {
        activeSessionForView = s.id;
        try { history.replaceState(null, '', '#session/' + encodeURIComponent(s.id)); } catch (_) {}
        render();
      });
      list.appendChild(row);
    });
    sidebar.appendChild(list);
    shell.appendChild(sidebar);

    const pane = el('div','session-pane');
    const selected = sessions.find(s => s.id === activeSessionForView);
    if (!selected) {
      pane.appendChild(el('div','none','Select a session from the sidebar.'));
    } else {
      const ol = document.createElement('ol');
      ol.className = 'timeline';
      ol.style.padding = '0';
      ol.style.margin = '0';
      ol.style.listStyle = 'none';
      groupIntoTurns(selected.nodes).forEach(t => ol.appendChild(renderTurn(t)));
      pane.appendChild(ol);
    }
    shell.appendChild(pane);

    root.appendChild(shell);
  }

  // ─────────── Turn grouping (v1.1) ───────────
  // Each prompt opens a turn. Subsequent tool calls + sub-agent activity
  // belong to that turn. The Stop response closes it. Anything before any
  // prompt becomes an orphan turn (no header), so SessionStart and the like
  // still render visibly.
  function isPromptNode(n) {
    return (n.tags || []).indexOf('prompt') !== -1 || (n.agent === 'founder' && n.kind !== 'decision');
  }
  function isResponseNode(n) {
    return n.kind === 'response' && n.agent === 'orchestrator' && (n.tags || []).indexOf('response') !== -1;
  }
  function groupIntoTurns(nodes) {
    // v1.2: prefer node.turn_id (deterministic). For older nodes that
    // pre-date turn_id, fall back to the v1.1 prompt-boundary heuristic.
    const haveTurnIds = nodes.some(n => n && n.turn_id);
    if (haveTurnIds) return groupByTurnId(nodes);
    return groupByHeuristic(nodes);
  }

  function groupByTurnId(nodes) {
    const buckets = new Map();          // turn_id -> turn obj
    const orphans = { prompt: null, children: [], response: null, ts: null };
    nodes.forEach(n => {
      const tid = n.turn_id;
      if (!tid) {
        if (orphans.ts == null) orphans.ts = n.ts;
        orphans.children.push(n);
        return;
      }
      let t = buckets.get(tid);
      if (!t) {
        t = { id: tid, prompt: null, children: [], response: null, ts: n.ts };
        buckets.set(tid, t);
      }
      if (isPromptNode(n)) t.prompt = n;
      else if (isResponseNode(n)) t.response = n;
      else t.children.push(n);
      // Earliest ts wins as the turn ts (so we sort cleanly).
      if (!t.ts || (n.ts && n.ts < t.ts)) t.ts = n.ts;
    });
    const turns = [];
    if (orphans.children.length) turns.push(orphans);
    Array.from(buckets.values())
      .sort((a, b) => (a.ts || '').localeCompare(b.ts || ''))
      .forEach(t => turns.push(t));
    return turns;
  }

  function groupByHeuristic(nodes) {
    const turns = [];
    let current = null;
    nodes.forEach(n => {
      if (isPromptNode(n)) {
        if (current) turns.push(current);
        current = { prompt: n, children: [], response: null, ts: n.ts };
      } else if (current && isResponseNode(n)) {
        current.response = n;
        turns.push(current);
        current = null;
      } else if (current) {
        current.children.push(n);
      } else {
        turns.push({ prompt: null, children: [n], response: null, ts: n.ts });
      }
    });
    if (current) turns.push(current);
    return turns;
  }

  function turnSummary(turn) {
    // Build the "X reads · Y edits · Z bash · subagent: name" strip.
    const counts = {};
    let subagent = null;
    (turn.children || []).forEach(c => {
      const tags = c.tags || [];
      if (tags.indexOf('read') !== -1) counts.reads = (counts.reads || 0) + 1;
      else if (tags.indexOf('wrote') !== -1 || tags.indexOf('edited') !== -1) counts.edits = (counts.edits || 0) + 1;
      else if (tags.indexOf('bash') !== -1) counts.bash = (counts.bash || 0) + 1;
      else if (tags.indexOf('search') !== -1) counts.search = (counts.search || 0) + 1;
      else if (tags.indexOf('web') !== -1) counts.web = (counts.web || 0) + 1;
      else if (tags.indexOf('fork') !== -1 || tags.indexOf('merge') !== -1) {
        counts.subagent = (counts.subagent || 0) + 1;
        if (!subagent && c.agent && c.agent !== 'orchestrator' && c.agent !== 'founder') subagent = c.agent;
      } else {
        counts.other = (counts.other || 0) + 1;
      }
    });
    const parts = [];
    if (counts.reads)    parts.push(`<strong>${counts.reads}</strong> reads`);
    if (counts.edits)    parts.push(`<strong>${counts.edits}</strong> edits`);
    if (counts.bash)     parts.push(`<strong>${counts.bash}</strong> bash`);
    if (counts.search)   parts.push(`<strong>${counts.search}</strong> search`);
    if (counts.web)      parts.push(`<strong>${counts.web}</strong> web`);
    if (counts.subagent) parts.push(`<strong>${counts.subagent}</strong> sub-agent`);
    if (subagent) parts.push(`→ <em>${escapeHtml(subagent)}</em>`);
    if (counts.other && !parts.length) parts.push(`<strong>${counts.other}</strong> tool calls`);
    return parts.join(' · ');
  }

  function renderTurn(turn) {
    const li = el('li','turn');
    if (turn.prompt) {
      li.dataset.id = turn.prompt.id;
      li.id = turn.prompt.id;
    }
    // Rail with the trunk dot anchored on the prompt.
    const rail = el('div','rail');
    const marker = el('div','marker is-filled');
    if (turn.prompt && turn.prompt.agent === 'founder') {
      marker.style.setProperty('--lane', 'var(--apricot-600)');
    }
    rail.appendChild(marker);
    li.appendChild(rail);

    // Outer card representing the turn.
    const card = document.createElement('details');
    card.className = 'card turn-card';
    card.dataset.status = (turn.prompt ? turn.prompt.status : (turn.children[0] && turn.children[0].status) || 'completed');
    // Default open if it's the latest turn (no response = in progress).
    if (!turn.response) card.open = true;

    const sum = document.createElement('summary');
    sum.appendChild(el('span','lane-mark'));

    if (turn.prompt) {
      const pillEl = el('span','agent-pill');
      pillEl.style.setProperty('--lane', laneVar('founder'));
      pillEl.appendChild(el('span','swatch'));
      pillEl.appendChild(document.createTextNode(' you'));
      sum.appendChild(pillEl);

      const titleEl = el('h3','title');
      titleEl.textContent = turn.prompt.title || '(empty prompt)';
      sum.appendChild(titleEl);
    } else {
      const titleEl = el('h3','title');
      titleEl.textContent = '(session events)';
      titleEl.style.color = 'var(--mid)';
      titleEl.style.fontStyle = 'italic';
      sum.appendChild(titleEl);
    }

    const tag = el('span','status-tag');
    tag.appendChild(el('span','dot'));
    tag.appendChild(document.createTextNode(turn.response ? 'replied' : (turn.children.length ? 'working…' : 'open')));
    sum.appendChild(tag);

    const tm = el('span','time');
    tm.innerHTML = `<time>${escapeHtml(shortTime(turn.ts))}</time> <span class="rel">· ${escapeHtml(rel(turn.ts))}</span>`;
    sum.appendChild(tm);

    const chev = el('span','chevron');
    chev.innerHTML = chevronSvg();
    sum.appendChild(chev);
    card.appendChild(sum);

    // Activity strip — shown ALWAYS so collapsed cards still tell the story.
    if (turn.children.length || turn.response) {
      const strip = el('div','turn-strip');
      const activity = turnSummary(turn);
      const respPreview = turn.response ? `<span class="resp-preview">↪ ${escapeHtml(turn.response.summary || turn.response.title || '')}</span>` : '';
      strip.innerHTML = (activity || '') + (activity && respPreview ? ' · ' : '') + respPreview;
      sum.parentNode.insertBefore(strip, sum.nextSibling);
    }

    // Body — only when expanded.
    const body = el('div','body turn-body');

    // 1. Full prompt body
    if (turn.prompt && turn.prompt.blocks && turn.prompt.blocks.length) {
      const promptSection = el('div','turn-section');
      promptSection.appendChild(el('div','section-label','prompt'));
      const inner = el('div','blocks');
      turn.prompt.blocks.forEach(b => {
        const r = renderers[b.type];
        if (r) inner.appendChild(r(b));
      });
      promptSection.appendChild(inner);
      body.appendChild(promptSection);
    }

    // 2. Each child rendered as a compact child-card
    if (turn.children.length) {
      const childSection = el('div','turn-section');
      childSection.appendChild(el('div','section-label', `during this turn · ${turn.children.length}`));
      const childList = el('ul','turn-children');
      turn.children.forEach(c => {
        const childLi = el('li','turn-child');
        childLi.dataset.kind = c.kind || '';
        childLi.dataset.agent = c.agent || '';
        childLi.style.setProperty('--lane', laneVar(c.agent));
        const cTime = el('span','child-time');
        cTime.textContent = shortTime(c.ts);
        const cAgent = el('span','child-agent');
        cAgent.textContent = c.agent || '';
        cAgent.style.color = laneVar(c.agent);
        const cTitle = el('span','child-title');
        cTitle.textContent = c.title || '';
        childLi.appendChild(cTime);
        childLi.appendChild(cAgent);
        childLi.appendChild(cTitle);
        childList.appendChild(childLi);
      });
      childSection.appendChild(childList);
      body.appendChild(childSection);
    }

    // 3. Claude's response
    if (turn.response) {
      const respSection = el('div','turn-section turn-response');
      respSection.appendChild(el('div','section-label','response'));
      const inner = el('div','blocks');
      if (turn.response.blocks && turn.response.blocks.length) {
        turn.response.blocks.forEach(b => {
          const r = renderers[b.type];
          if (r) inner.appendChild(r(b));
        });
      } else {
        const md = el('div','block md');
        md.textContent = turn.response.title || '';
        inner.appendChild(md);
      }
      respSection.appendChild(inner);
      body.appendChild(respSection);
    }

    card.appendChild(body);
    li.appendChild(card);
    return li;
  }

  // ─────────── Render ───────────
  function render() {
    const allNodes = (window.TIMELINE_NODES || []).slice().sort((a, b) => {
      if (a.ts === b.ts) return (a.id||'').localeCompare(b.id||'');
      return (a.ts||'').localeCompare(b.ts||'');
    });
    const visible = allNodes.filter(matches);
    const root = document.getElementById('timeline');
    root.innerHTML = '';
    if (!visible.length) {
      root.appendChild(el('div','empty','No nodes match the current filters.'));
    } else if (activeMode === 'events') {
      // Raw event log: each node as its own card (v1.0 behavior).
      visible.forEach(n => root.appendChild(renderNode(n)));
    } else {
      // v1.3: detect parallel sessions in the same project. If >1 distinct
      // session id is present (and the user hasn't filtered to a single one),
      // render as side-by-side columns. Otherwise single-column turn cards.
      const sessionIds = Array.from(new Set(visible.map(n => n.session || 'main')));
      if (sessionIds.length > 1 && activeSession === 'all') {
        renderMultiSession(root, visible, sessionIds);
      } else {
        const turns = groupIntoTurns(visible);
        turns.forEach(t => root.appendChild(renderTurn(t)));
      }
    }

    // header counts
    document.getElementById('meta-count').textContent = visible.length;
    if (allNodes.length) {
      const first = new Date(allNodes[0].ts), last = new Date(allNodes[allNodes.length-1].ts);
      const ms = isNaN(first) || isNaN(last) ? 0 : (last - first);
      document.getElementById('meta-elapsed').textContent = fmtElapsed(ms);
      document.getElementById('meta-window').innerHTML =
        `window <strong>${shortTime(allNodes[0].ts)} → ${shortTime(allNodes[allNodes.length-1].ts)}</strong>`;
    }

    renderStatsRibbon(allNodes);
    renderFailureBanner(allNodes);
    buildFilters();
    applyViewMode();
  }

  function applyViewMode() {
    const app = document.getElementById('app');
    app.classList.remove('is-summary-mode-on','is-summary-mode-off','is-compact-mode');
    if (activeMode === 'summary') {
      app.classList.add('is-summary-mode-on');
    } else if (activeMode === 'compact') {
      app.classList.add('is-compact-mode');
      document.querySelectorAll('details.card').forEach(d => d.open = false);
    } else {
      app.classList.add('is-summary-mode-off');
    }
  }

  // ─────────── Auto-refresh (poll nodes.js) ───────────
  // v1.0: re-fetch nodes.js every REFRESH_MS; rerender if it changed.
  // No SSE — keeps the server zero-magic.
  const REFRESH_MS = 5000;
  let lastNodesText = '';

  async function pollOnce() {
    try {
      const r = await fetch('data/nodes.js?_t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const txt = await r.text();
      if (txt === lastNodesText) return;
      lastNodesText = txt;
      const m = txt.match(/window\.TIMELINE_NODES\s*=\s*(\[[\s\S]*\])\s*;/);
      if (!m) return;
      try {
        window.TIMELINE_NODES = JSON.parse(m[1]);
      } catch (_) { return; }
      // Preserve which cards are open across rerenders.
      const openIds = new Set();
      document.querySelectorAll('details.card[open]').forEach(d => {
        const li = d.closest('li.node');
        if (li && li.dataset.id) openIds.add(li.dataset.id);
      });
      render();
      openIds.forEach(id => {
        try {
          const li = document.querySelector(`li.node[data-id="${CSS.escape(id)}"]`);
          if (li) {
            const card = li.querySelector('details.card');
            if (card) card.open = true;
          }
        } catch (_) { /* CSS.escape may not exist on very old browsers */ }
      });
    } catch (_) { /* fail-soft */ }
  }

  // ─────────── Boot ───────────
  function readSessionFromHash() {
    const m = (location.hash || '').match(/^#session\/(.+)$/);
    if (m) {
      try { activeSessionForView = decodeURIComponent(m[1]); }
      catch (_) { activeSessionForView = m[1]; }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    readSessionFromHash();
    window.addEventListener('hashchange', () => { readSessionFromHash(); render(); });
    render();
    // Seed polling baseline so we don't immediately rerender on first tick.
    fetch('data/nodes.js?_t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.ok ? r.text() : '')
      .then(t => { lastNodesText = t; })
      .catch(() => {});
    setInterval(pollOnce, REFRESH_MS);

    document.getElementById('search').addEventListener('input', e => {
      searchQuery = e.target.value; render();
    });
    document.getElementById('btn-collapse-all').addEventListener('click', () => {
      document.querySelectorAll('details.card').forEach(d => d.open = false);
    });
    document.getElementById('btn-expand-all').addEventListener('click', () => {
      document.querySelectorAll('details.card').forEach(d => d.open = true);
    });
    document.getElementById('view-mode').addEventListener('click', e => {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      activeMode = btn.dataset.mode;
      document.querySelectorAll('#view-mode button').forEach(b => b.classList.toggle('is-active', b === btn));
      applyViewMode();
    });
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault(); document.getElementById('search').focus();
      }
    });
  });
})();
