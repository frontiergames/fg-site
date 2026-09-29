// Renders published fg-bench result bundles from data/. The site never computes
// rankings itself: rank, medals and intervals come from the bundle as published.
"use strict";

const DATA = "data/";
const $ = (sel, root = document) => root.querySelector(sel);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- Icons (inline, stroke-based) ----------

const ICONS = {
  chart: '<path d="M3 3v18h18M8 17v-5M13 17V7M18 17v-9"/>',
  calendar: '<path d="M3 5h18v16H3zM16 3v4M8 3v4M3 10h18"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
  grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
  check: '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3"/>',
  pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  flag: '<path d="M4 22v-7M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>',
  scatter: '<path d="M3 3v18h18"/><circle cx="8" cy="14" r="1.5"/><circle cx="12" cy="9" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="18" cy="6" r="1.5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  horizon: '<path d="M3 18h18M5 18a7 7 0 0 1 14 0M12 4v3M4.9 8.9l2.1 2.1M19.1 8.9 17 11"/>',
  tree: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 7v10M18 11c0 4-6 3-10 6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
  table: '<path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4M9 18c-4.51 2-5-2-7-2"/>',
};
const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
const BOARD_ICON = { solving: "check", authoring: "pen", "solve-or-object": "flag" };

// ---------- Data ----------

async function getJSON(path) {
  const res = await fetch(DATA + path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function loadEvents() {
  const index = await getJSON("index.json");
  const events = await Promise.all(index.events.map((e) => getJSON(e.path)));
  events.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { index, events };
}

// Colour follows the model, never its rank: slots are assigned by sorted name
// across every published event, so a model keeps its colour on every chart.
let colorSlots = new Map();
function assignColorsFor(names) {
  const sorted = [...new Set(names)].sort();
  colorSlots = new Map(sorted.map((n, i) => [n, i < 8 ? `var(--s${i + 1})` : "var(--muted)"]));
}
const assignColors = (events) => assignColorsFor(events.flatMap((e) => e.boards.flatMap((b) => b.standings.map((r) => r.model.name))));
const colorOf = (name) => colorSlots.get(name) || "var(--muted)";

// ---------- Formatting ----------

const fmt = (v, d = 0) => (typeof v === "number" ? v.toFixed(d).replace("-", "−") : esc(v));

function fmtCell(v, col) {
  if (v === undefined || v === null) return '<span class="muted">—</span>';
  if (col.format === "percent") return `${Math.round(v * 100)}%`;
  if (col.format === "bool") return v ? "Yes" : '<span class="muted">No</span>';
  return fmt(v, col.decimals ?? 0);
}

function fmtDate(d) {
  const t = new Date(d + "T00:00:00Z");
  return isNaN(t) ? esc(d) : t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const isShared = (board, row) => board.standings.filter((r) => r.rank === row.rank).length > 1;
const rankText = (board, row) => (isShared(board, row) ? "=" : "") + row.rank;
const ciText = (row, d) => (row.ci ? `${fmt(row.ci[0], d)} – ${fmt(row.ci[1], d)}` : "");
const pill = (ev) => `<span class="pill ${esc(ev.status || "final")}">${esc(ev.status || "final")}</span>`;
const medal = (row) => (row.medal ? `<span class="medal ${esc(row.medal)}" aria-label="${esc(row.medal)} medal">${{ gold: 1, silver: 2, bronze: 3 }[row.medal]}</span>` : "");

function avatar(row) {
  const m = row.model;
  const letter = m.short || m.name.trim().split(/\s+/).pop().slice(0, 2);
  const c = colorOf(m.name);
  return `<span class="av" style="background:color-mix(in srgb, ${c} 14%, var(--panel));border-color:color-mix(in srgb, ${c} 30%, var(--line))">${esc(letter)}${medal(row)}</span>`;
}

function niceTicks(lo, hi, count = 5) {
  const raw = (hi - lo) / count || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { ticks, lo: start, hi: end, step };
}
function decimalsFor(step) {
  let d = 0;
  while (d < 6 && Math.abs(step * 10 ** d - Math.round(step * 10 ** d)) > 1e-9) d++;
  return d;
}

// ---------- Tooltip ----------

const tip = document.createElement("div");
tip.className = "tip";
tip.setAttribute("role", "tooltip");
document.body.appendChild(tip);

function showTip(e, html) {
  tip.innerHTML = html;
  tip.classList.add("on");
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + w > innerWidth - 8) x = e.clientX - w - pad;
  if (y + h > innerHeight - 8) y = e.clientY - h - pad;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}
const hideTip = () => tip.classList.remove("on");
const tipRow = (k, v) => `<div class="r"><span>${k}</span><b>${v}</b></div>`;
const tipHead = (name) => `<div class="h"><span class="dot" style="--c:${colorOf(name)}"></span>${esc(name)}</div>`;

function rowTip(board, row) {
  const d = board.metric.decimals ?? 0;
  const extra = (board.columns || []).slice(0, 3).map((c) => tipRow(esc(c.label), fmtCell(row.stats?.[c.key], c))).join("");
  return tipHead(row.model.name) + tipRow("Rank", rankText(board, row)) + tipRow(esc(board.metric.label), fmt(row.score, d)) +
    (row.ci ? tipRow("95% interval", ciText(row, d)) : "") + extra;
}

// ---------- Interval chart ----------

function intervalChart(board) {
  const d = board.metric.decimals ?? 0;
  let lo = Infinity, hi = -Infinity;
  for (const r of board.standings) {
    const [a, b] = r.ci || [r.score, r.score];
    lo = Math.min(lo, a); hi = Math.max(hi, b);
  }
  const s = niceTicks(lo, hi, 5);
  const x = (v) => ((v - s.lo) / (s.hi - s.lo)) * 100;
  const td = decimalsFor(s.step);
  const leader = board.standings[0];
  const grid = s.ticks.map((t) => `<line class="g" x1="${x(t)}%" x2="${x(t)}%" y1="0" y2="40"/>`).join("");

  const rows = board.standings.map((r, i) => {
    const [a, b] = r.ci || [r.score, r.score];
    return `<div class="ivl-row" data-i="${i}" style="--c:${colorOf(r.model.name)}">
      <span class="n num">${esc(rankText(board, r))}</span>
      <span class="nm">${esc(r.model.name)}${medal(r)}</span>
      <svg aria-hidden="true">${grid}
        ${i ? `<line class="lead" x1="${x(leader.score)}%" x2="${x(leader.score)}%" y1="4" y2="36"/>` : ""}
        <line class="w" x1="${x(a)}%" x2="${x(b)}%" y1="27" y2="27"/>
        <line class="w" x1="${x(a)}%" x2="${x(a)}%" y1="23" y2="31"/>
        <line class="w" x1="${x(b)}%" x2="${x(b)}%" y1="23" y2="31"/>
        <circle class="p" cx="${x(r.score)}%" cy="27" r="5"/>
        <text x="${x(r.score)}%" y="14" text-anchor="middle">${fmt(r.score, d)}</text>
      </svg></div>`;
  }).join("");

  const ticks = s.ticks.map((t) => `<span style="left:${x(t)}%">${fmt(t, td)}</span>`).join("");
  return `<div class="ivl">
    <div class="ivl-row head"><span></span><span>Model</span><div class="ticks">${ticks}</div></div>${rows}</div>`;
}

function statsTable(board) {
  const d = board.metric.decimals ?? 0;
  const cols = board.columns || [];
  return `<div class="tbl-wrap"><table class="stats">
    <thead><tr><th>#</th><th>Model</th><th>${esc(board.metric.label)}</th><th>95% interval</th>${cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${board.standings.map((r) => `<tr>
      <td>${esc(rankText(board, r))}</td>
      <td><span style="display:inline-flex;align-items:center;gap:8px"><span class="dot" style="--c:${colorOf(r.model.name)}"></span>${esc(r.model.name)}${medal(r)}</span></td>
      <td><b>${fmt(r.score, d)}</b></td><td class="muted">${ciText(r, d)}</td>
      ${cols.map((c) => `<td>${fmtCell(r.stats?.[c.key], c)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

// ---------- Ranked list (two columns) ----------

function rankList(board, limit = 10) {
  const d = board.metric.decimals ?? 0;
  const rows = board.standings;
  const item = (r) => `<li class="ri">
    <span class="n num">${esc(rankText(board, r))}.</span>${avatar(r)}
    <span class="nm"><b>${esc(r.model.name)}</b><span>by ${esc(r.model.family || "unknown")}</span></span>
    <span class="val"><b class="num">${fmt(r.score, d)}<span class="dot" style="--c:${colorOf(r.model.name)}"></span></b>
      ${isShared(board, r) ? '<span class="tag">shared</span>' : `<small class="num">${ciText(r, d)}</small>`}</span></li>`;
  const shown = rows.slice(0, limit);
  const half = Math.ceil(shown.length / 2);
  const more = rows.length > limit
    ? `<div class="more"><button data-more>Show ${rows.length - limit} more ${icon("chevron")}</button></div>` : "";
  return `<div class="rank-list"><ol>${shown.slice(0, half).map(item).join("")}</ol><ol>${shown.slice(half).map(item).join("")}</ol></div>${more}`;
}

// ---------- Board section ----------

function leaderVerdict(board) {
  const [first, second] = board.standings;
  const d = board.metric.decimals ?? 0;
  if (!second) return "";
  if (isShared(board, first)) return "Shared first place";
  const gap = fmt(first.score - second.score, d);
  if (!first.ci || !second.ci) return `Leads by ${gap}`;
  return second.ci[1] < first.ci[0] ? `Clear lead of ${gap}` : `Leads by ${gap}, intervals overlap`;
}

function boardSection(ev, board, { eventLink }) {
  const id = `b-${ev.id}-${board.id}`;
  const src = eventLink
    ? ` From <a href="event.html?id=${encodeURIComponent(ev.id)}">${esc(ev.title)}</a>, ${fmtDate(ev.date)}.` : "";
  return `<section class="sec" id="${esc(id)}" data-board="${esc(ev.id)}:${esc(board.id)}">
    <div class="sec-h">
      <div><h2>${icon(BOARD_ICON[board.id] || "trophy")}${esc(board.title)}</h2>
        <p>${esc(board.metric.label)}, higher is better.${src}</p></div>
      <div class="seg" role="group" aria-label="View"><button data-view="chart" aria-pressed="true">Intervals</button><button data-view="table" aria-pressed="false">Table</button></div>
    </div>
    <div class="card">
      <div class="card-h"><span>${board.standings.length} models · ranked by ${esc(board.metric.label)}</span>${pill(ev)}</div>
      <div data-body>${intervalChart(board)}</div>
      <div class="chart-foot"><span>${esc(board.metric.method)}.</span><span>Dashed line: leader's score</span></div>
    </div>
    <div data-list>${rankList(board)}</div>
  </section>`;
}

function wireBoard(sec, lookup) {
  const { board } = lookup(sec.dataset.board);
  sec.addEventListener("click", (e) => {
    const v = e.target.closest("[data-view]");
    if (v) {
      for (const b of sec.querySelectorAll("[data-view]")) b.setAttribute("aria-pressed", String(b === v));
      $("[data-body]", sec).innerHTML = v.dataset.view === "table" ? statsTable(board) : intervalChart(board);
    }
    if (e.target.closest("[data-more]")) $("[data-list]", sec).innerHTML = rankList(board, Infinity);
  });
  sec.addEventListener("mousemove", (e) => {
    const row = e.target.closest(".ivl-row[data-i]");
    if (row) showTip(e, rowTip(board, board.standings[+row.dataset.i]));
    else hideTip();
  });
  sec.addEventListener("mouseleave", hideTip);
}

// ---------- Scatter: two boards of one event against each other ----------

function scatterSection(ev) {
  const [yb, xb] = ev.boards;
  return `<section class="sec" id="x-${esc(ev.id)}" data-scatter="${esc(ev.id)}">
    <div class="sec-h"><div><h2>${icon("scatter")}${esc(yb.title)} vs ${esc(xb.title)}</h2>
      <p>Is the best solver also the best author? Each dot is one model. Hover to see both 95% intervals.</p></div></div>
    <div class="card"><div class="card-h"><span>${esc(ev.title)}</span>${pill(ev)}</div><div class="scatter" data-plot></div></div>
  </section>`;
}

function drawScatter(sec, ev) {
  const [yb, xb] = ev.boards;
  const byName = new Map(xb.standings.map((r) => [r.model.name, r]));
  const pts = yb.standings.filter((r) => byName.has(r.model.name)).map((r) => ({ y: r, x: byName.get(r.model.name), name: r.model.name }));
  const el = $("[data-plot]", sec);
  const W = Math.max(280, el.clientWidth - 24), narrow = W < 520, H = narrow ? 300 : 380;
  const m = { l: 48, r: narrow ? 16 : 120, t: 18, b: 48 };
  const ext = (get) => {
    const v = pts.flatMap((p) => { const r = get(p); return r.ci ? [r.ci[0], r.ci[1]] : [r.score]; });
    return niceTicks(Math.min(...v), Math.max(...v), 5);
  };
  const sx = ext((p) => p.x), sy = ext((p) => p.y);
  const X = (v) => m.l + ((v - sx.lo) / (sx.hi - sx.lo)) * (W - m.l - m.r);
  const Y = (v) => H - m.b - ((v - sy.lo) / (sy.hi - sy.lo)) * (H - m.t - m.b);
  const xd = decimalsFor(sx.step), yd = decimalsFor(sy.step);

  // Keep direct labels from colliding: push a label down when it sits within 15px of one above.
  const labels = pts.map((p, i) => ({ i, x: X(p.x.score), y: Y(p.y.score) + 4 })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < labels.length; k++) {
    for (let q = 0; q < k; q++) {
      const a = labels[q], b = labels[k];
      if (Math.abs(a.x - b.x) < 130 && b.y - a.y < 15) b.y = a.y + 15;
    }
  }
  const labelY = new Map(labels.map((l) => [l.i, l.y]));

  const grid = sx.ticks.map((t) => `<line class="g" x1="${X(t)}" x2="${X(t)}" y1="${m.t}" y2="${H - m.b}"/><text x="${X(t)}" y="${H - m.b + 18}" text-anchor="middle">${fmt(t, xd)}</text>`).join("") +
    sy.ticks.map((t) => `<line class="g" x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${fmt(t, yd)}</text>`).join("");
  const zero = (sx.lo < 0 && sx.hi > 0 ? `<line class="ax" x1="${X(0)}" x2="${X(0)}" y1="${m.t}" y2="${H - m.b}"/>` : "") +
    (sy.lo < 0 && sy.hi > 0 ? `<line class="ax" x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}"/>` : "");
  const marks = pts.map((p, i) => {
    const cx = X(p.x.score), cy = Y(p.y.score);
    const xc = p.x.ci ? `<line class="ci" x1="${X(p.x.ci[0])}" x2="${X(p.x.ci[1])}" y1="${cy}" y2="${cy}"/>` : "";
    const yc = p.y.ci ? `<line class="ci" x1="${cx}" x2="${cx}" y1="${Y(p.y.ci[0])}" y2="${Y(p.y.ci[1])}"/>` : "";
    const lbl = narrow ? "" : `<text class="lbl" x="${cx + 12}" y="${labelY.get(i)}">${esc(p.name)}</text>`;
    return `<g class="m" data-i="${i}" style="--c:${colorOf(p.name)}">${xc}${yc}<circle class="pt" cx="${cx}" cy="${cy}" r="7"/>${lbl}</g>`;
  }).join("");
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(yb.title)} score against ${esc(xb.title)} score per model">
    ${grid}${zero}${marks}
    <text x="${m.l + (W - m.l - m.r) / 2}" y="${H - 8}" text-anchor="middle">${esc(xb.title)} · ${esc(xb.metric.label)} →</text>
    <text transform="translate(12 ${m.t + (H - m.t - m.b) / 2}) rotate(-90)" text-anchor="middle">${esc(yb.title)} · ${esc(yb.metric.label)} →</text>
  </svg>`;
  el._pts = pts;
}

function wireScatter(sec, ev) {
  const el = $("[data-plot]", sec);
  let raf, lastW = 0;
  new ResizeObserver(() => {
    if (el.clientWidth === lastW) return;
    lastW = el.clientWidth;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => drawScatter(sec, ev));
  }).observe(el);
  drawScatter(sec, ev);
  const [yb, xb] = ev.boards;
  el.addEventListener("mousemove", (e) => {
    const g = e.target.closest("g.m");
    el.querySelectorAll("g.on").forEach((n) => n !== g && n.classList.remove("on"));
    el.classList.toggle("dim", !!g);
    if (!g) return hideTip();
    g.classList.add("on");
    const p = el._pts[+g.dataset.i];
    const dy = yb.metric.decimals ?? 0, dx = xb.metric.decimals ?? 0;
    showTip(e, tipHead(p.name) +
      tipRow(esc(yb.title), `${fmt(p.y.score, dy)} <span class="muted">(${ciText(p.y, dy)})</span>`) +
      tipRow(esc(xb.title), `${fmt(p.x.score, dx)} <span class="muted">(${ciText(p.x, dx)})</span>`));
  });
  el.addEventListener("mouseleave", () => { el.classList.remove("dim"); el.querySelectorAll("g.on").forEach((n) => n.classList.remove("on")); hideTip(); });
}

// ---------- Evidence ----------

const EV_KINDS = [
  ["verified", "Verified to specification", "var(--ev-verified)"],
  ["reviewed", "Reviewed", "var(--ev-reviewed)"],
  ["unresolved", "Unresolved (not scored)", "var(--ev-unresolved)"],
];
const evTotal = (ev) => EV_KINDS.reduce((s, [k]) => s + (ev.evidence[k] || 0), 0);

function evidenceSection(events) {
  const withEv = events.filter((e) => e.evidence && evTotal(e));
  if (!withEv.length) return "";
  const rows = withEv.map((ev) => {
    const total = evTotal(ev);
    const segs = EV_KINDS.filter(([k]) => ev.evidence[k]).map(([k, label, c]) =>
      `<span data-ev="${esc(ev.id)}" data-k="${k}" style="width:${(ev.evidence[k] / total) * 100}%;background:${c}" aria-label="${label}: ${ev.evidence[k]}"></span>`).join("");
    return `<div class="ev-row"><a href="event.html?id=${encodeURIComponent(ev.id)}">${esc(ev.title)}</a><div class="ev-bar">${segs}</div><span class="num muted" style="text-align:right">${total}</span></div>`;
  }).join("");
  return `<section class="sec" id="evidence">
    <div class="sec-h"><div><h2>${icon("shield")}Evidence</h2>
      <p>How every outcome was decided. Unresolved items are counted here but never scored as a win or a loss.</p></div></div>
    <div class="card"><div class="card-h"><div class="legend">${EV_KINDS.map(([, l, c]) => `<span><i style="--c:${c}"></i>${l}</span>`).join("")}</div><span>Outcomes</span></div>
    <div class="ev-rows">${rows}</div></div>
  </section>`;
}

function wireEvidence(sec, events) {
  sec.addEventListener("mousemove", (e) => {
    const s = e.target.closest("[data-ev]");
    if (!s) return hideTip();
    const ev = events.find((x) => x.id === s.dataset.ev);
    const [, label, c] = EV_KINDS.find(([k]) => k === s.dataset.k);
    const n = ev.evidence[s.dataset.k], total = evTotal(ev);
    showTip(e, `<div class="h"><span class="dot" style="--c:${c}"></span>${label}</div>` + tipRow(esc(ev.title), `${n} of ${total} (${Math.round((n / total) * 100)}%)`));
  });
  sec.addEventListener("mouseleave", hideTip);
}

// ---------- Leaders + events ----------

function leadersSection(events) {
  const cards = events.flatMap((ev) => ev.boards.map((b) => {
    const top = b.standings.filter((r) => r.rank === b.standings[0].rank);
    const d = b.metric.decimals ?? 0;
    return `<a class="lead-card" href="#b-${esc(ev.id)}-${esc(b.id)}">
      <div class="t"><span style="display:inline-flex;gap:7px;align-items:center">${icon(BOARD_ICON[b.id] || "trophy")}${esc(b.title)}</span>${pill(ev)}</div>
      <div class="who">${avatar(top[0])}<div><div class="name">${top.map((r) => esc(r.model.name)).join(" & ")}</div><div class="by">by ${esc(top[0].model.family || "unknown")}</div></div></div>
      <div class="score num">${fmt(top[0].score, d)}<small>${esc(b.metric.label)}</small></div>
      <div class="v">${esc(leaderVerdict(b))}</div></a>`;
  })).join("");
  return `<section class="sec" id="leaders">
    <div class="sec-h"><div><h2>${icon("trophy")}Event leaders</h2>
      <p>Each event awards its own medals. There is no overall champion until a combined score has been fixed in advance and validated.</p></div></div>
    <div class="leaders">${cards}</div></section>`;
}

function eventsSection(events) {
  const rows = events.map((ev) => `<tr>
    <td class="num muted" style="white-space:nowrap">${fmtDate(ev.date)}</td>
    <td><a href="event.html?id=${encodeURIComponent(ev.id)}">${esc(ev.title)}</a><div class="muted opt" style="font-size:13px;max-width:420px">${esc(ev.summary)}</div></td>
    <td><div class="winners">${ev.boards.map((b) => `<div><span class="medal gold">1</span><span class="muted">${esc(b.title)}</span>${b.standings.filter((r) => r.medal === "gold").map((r) => esc(r.model.name)).join(" & ")}</div>`).join("")}</div></td>
    <td>${pill(ev)}</td></tr>`).join("");
  return `<section class="sec" id="events">
    <div class="sec-h"><div><h2>${icon("calendar")}Events</h2><p>Every published event, newest first. Each links to full standings, evidence and artifact hashes.</p></div></div>
    <div class="card tbl-wrap"><table class="events"><thead><tr><th>Date</th><th>Event</th><th>Winners</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}

// ---------- Page assembly ----------

function sampleNotice(events) {
  return events.some((e) => e.sample)
    ? `<div class="notice">${icon("info")}<span><b>Sample data.</b> No event has been run yet. These standings use fictional models to preview how published results will look.</span></div>` : "";
}

function sectionsFor(events, { eventLink }) {
  const out = [];
  for (const ev of events) {
    for (const b of ev.boards) {
      out.push({ id: `b-${ev.id}-${b.id}`, label: b.title, icon: BOARD_ICON[b.id] || "trophy", html: boardSection(ev, b, { eventLink }) });
    }
    if (ev.boards.length >= 2) out.push({ id: `x-${ev.id}`, label: `${ev.boards[0].title} vs ${ev.boards[1].title}`, icon: "scatter", html: scatterSection(ev) });
  }
  return out;
}

function renderSide(items, extra = [["method.html", "book", "Method"]]) {
  $("#side").innerHTML = items.map((s) => `<a href="#${esc(s.id)}" data-sec="${esc(s.id)}">${icon(s.icon)}${esc(s.label)}</a>`).join("") +
    `<div class="sep"></div>` + extra.map(([h, i, l]) => `<a href="${h}">${icon(i)}${esc(l)}</a>`).join("");
  const links = new Map([...document.querySelectorAll("#side a[data-sec]")].map((a) => [a.dataset.sec, a]));
  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) {
      links.forEach((a) => a.classList.remove("on"));
      links.get(e.target.id)?.classList.add("on");
    }
  }, { rootMargin: "-80px 0px -70% 0px" });
  for (const id of links.keys()) { const el = document.getElementById(id); if (el) obs.observe(el); }
}

function wireAll(events) {
  const map = new Map(events.flatMap((ev) => ev.boards.map((b) => [`${ev.id}:${b.id}`, { ev, board: b }])));
  const lookup = (k) => map.get(k);
  document.querySelectorAll("[data-board]").forEach((s) => wireBoard(s, lookup));
  document.querySelectorAll("[data-scatter]").forEach((s) => wireScatter(s, events.find((e) => e.id === s.dataset.scatter)));
  const evs = $("#evidence");
  if (evs) wireEvidence(evs, events);
}

async function renderHome() {
  const { index, events } = await loadEvents();
  assignColors(events);
  const secs = sectionsFor(events, { eventLink: true });
  const finance = typeof financeTeaser === "function" ? await financeTeaser() : "";
  $("#main").innerHTML = `
    <div class="page-head">
      <h1>AI Model Rankings</h1>
      <p>Frontier models set problems for each other, solve them, catch each other's flaws and trade in a market arena. Every rank comes with its uncertainty and the evidence behind it. <a href="method.html">How scoring works</a></p>
      <div class="meta">Results through ${fmtDate(index.updated)}</div>
      ${sampleNotice(events)}
    </div>
    ${events.length ? leadersSection(events) + finance + secs.map((s) => s.html).join("") + evidenceSection(events) + eventsSection(events)
      : '<div class="card empty">No results published yet.</div>'}`;
  renderSide(events.length ? [{ id: "leaders", label: "Leaders", icon: "trophy" }, ...(finance ? [{ id: "finance", label: "Finance", icon: "trend" }] : []), ...secs,
    { id: "evidence", label: "Evidence", icon: "shield" }, { id: "events", label: "Events", icon: "calendar" }] : []);
  wireAll(events);
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

async function renderEvent() {
  const id = new URLSearchParams(location.search).get("id");
  const { events } = await loadEvents();
  assignColors(events);
  const ev = events.find((e) => e.id === id);
  if (!ev) {
    $("#main").innerHTML = `<div class="card empty"><h2>Event not found</h2><p><a href="./">Back to rankings</a></p></div>`;
    renderSide([]);
    return;
  }
  document.title = `${ev.title} · Frontier Games`;
  const secs = sectionsFor([ev], { eventLink: false });
  const arts = (ev.artifacts || []).map((a) =>
    `<li><span>${a.url ? `<a href="${esc(a.url)}">${esc(a.name)}</a>` : esc(a.name)}</span><code>sha256:${esc(a.sha256)}</code></li>`).join("");
  $("#main").innerHTML = `
    <div class="page-head">
      <div class="meta"><a href="./">Rankings</a> / <a href="./#events">Events</a></div>
      <h1>${esc(ev.title)} ${pill(ev)}</h1>
      <p>${esc(ev.summary)}</p>
      <div class="facts">
        <div><span>Date</span>${fmtDate(ev.date)}</div>
        <div><span>Rules</span><span class="mono">${esc(ev.rules_version)}</span></div>
        <div><span>Contenders</span>${ev.boards[0]?.standings.length ?? 0}</div>
        <div><span>Manifest</span><span class="mono muted">${esc(String(ev.manifest_digest).slice(0, 23))}…</span></div>
      </div>
      ${sampleNotice([ev])}
    </div>
    ${secs.map((s) => s.html).join("")}${evidenceSection([ev])}
    ${arts ? `<section class="sec" id="artifacts"><div class="sec-h"><div><h2>${icon("shield")}Released artifacts</h2><p>Hashes of every file released with this event. The signed manifest lists the same hashes.</p></div></div><div class="card"><ul class="art">${arts}</ul></div></section>` : ""}`;
  renderSide([...secs, ...(ev.evidence ? [{ id: "evidence", label: "Evidence", icon: "shield" }] : []),
    ...(arts ? [{ id: "artifacts", label: "Artifacts", icon: "shield" }] : [])]);
  wireAll([ev]);
}

// ---------- Theme toggle ----------

function initTheme() {
  const root = document.documentElement;
  try { const t = localStorage.getItem("theme"); if (t) root.dataset.theme = t; } catch {}
  const btn = $("#theme");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch {}
  });
}

function fail(err) {
  console.error(err);
  const main = $("#main");
  if (main) main.innerHTML = `<div class="card empty">Could not load results (${esc(err.message)}).</div>`;
}

document.querySelectorAll("[data-icon]").forEach((el) => el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon)));
initTheme();
const page = document.body.dataset.page;
if (page === "home") renderHome().catch(fail);
if (page === "event") renderEvent().catch(fail);
if (page === "arena") renderArena().catch(fail);
if (page === "knowledge") renderKnowledge().catch(fail);
if (page === "models") renderModels().catch(fail);
