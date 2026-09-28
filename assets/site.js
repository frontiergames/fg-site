// Renders published fg-bench result bundles from data/. The site never computes
// rankings itself: rank, medals and intervals come from the bundle as published.
"use strict";

const DATA = "data/";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function getJSON(path) {
  const res = await fetch(DATA + path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function loadEvents() {
  const index = await getJSON("index.json");
  const events = await Promise.all(index.events.map((e) => getJSON(e.path)));
  events.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return events;
}

function fmtNumber(v, decimals = 0) {
  if (typeof v !== "number") return esc(v);
  return v.toFixed(decimals).replace("-", "−");
}

function fmtCell(v, col) {
  if (v === undefined || v === null) return '<span class="dim">—</span>';
  switch (col.format) {
    case "percent": return `${Math.round(v * 100)}%`;
    case "bool": return v ? "Yes" : '<span class="dim">No</span>';
    default: return fmtNumber(v, col.decimals ?? 0);
  }
}

function fmtDate(d) {
  const t = new Date(d + "T00:00:00Z");
  return isNaN(t) ? esc(d) : t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function rankLabel(board, row) {
  const shared = board.standings.filter((r) => r.rank === row.rank).length > 1;
  return (shared ? "=" : "") + row.rank;
}

function medalBadge(row, small, text = row.rank) {
  const kind = row.medal || "none";
  const label = row.medal ? `${row.medal} medal, rank ${text}` : `rank ${text}`;
  return `<span class="medal ${kind}${small ? " sm" : ""}" role="img" aria-label="${esc(label)}">${esc(text)}</span>`;
}

function statusPill(ev) {
  const s = ev.status || "final";
  return `<span class="pill ${esc(s)}">${esc(s)}</span>`;
}

// ---------- Interval chart ----------

function scaleFor(board) {
  let lo = Infinity, hi = -Infinity;
  for (const r of board.standings) {
    const [a, b] = r.ci || [r.score, r.score];
    lo = Math.min(lo, a, r.score);
    hi = Math.max(hi, b, r.score);
  }
  const pad = (hi - lo) * 0.06 || 1;
  lo -= pad; hi += pad;
  return { lo, hi, x: (v) => ((v - lo) / (hi - lo)) * 100 };
}

function ciSvg(board, row, s, leader) {
  const [a, b] = row.ci || [row.score, row.score];
  const x = s.x;
  const leadLine = leader ? `<line class="lead" x1="${x(leader.score)}%" x2="${x(leader.score)}%" y1="2" y2="28"/>` : "";
  return `<svg aria-hidden="true">${leadLine}
    <line class="whisker" x1="${x(a)}%" x2="${x(b)}%" y1="15" y2="15"/>
    <line class="whisker" x1="${x(a)}%" x2="${x(a)}%" y1="10" y2="20"/>
    <line class="whisker" x1="${x(b)}%" x2="${x(b)}%" y1="10" y2="20"/>
    <circle class="dot" cx="${x(row.score)}%" cy="15" r="6"/>
    <rect class="hit" x="0" y="0" width="100%" height="30"/></svg>`;
}

// ---------- Board ----------

function podiumHTML(board) {
  const top = board.standings.filter((r) => r.medal).slice(0, 3);
  if (!top.length) return "";
  const d = board.metric.decimals ?? 0;
  const place = (row, cls) =>
    row
      ? `<div class="step ${cls}"><div class="card">${medalBadge(row)}
          <div class="pname">${esc(row.model.name)}</div><div class="pfam">${esc(row.model.family || "")}</div>
          <div class="pscore">${fmtNumber(row.score, d)}</div></div>
          <div class="block">${esc(rankLabel(board, row))}</div></div>`
      : `<div class="step empty"></div>`;
  // Classic podium layout: second, first, third.
  const cls = (row) => (row ? { gold: "p1", silver: "p2", bronze: "p3" }[row.medal] : "");
  return `<div class="podium">${place(top[1], cls(top[1]))}${place(top[0], cls(top[0]))}${place(top[2], cls(top[2]))}</div>`;
}

function boardHTML(ev, board, { link = true } = {}) {
  const m = board.metric;
  const d = m.decimals ?? 0;
  const s = scaleFor(board);
  const leader = board.standings[0];
  const cols = board.columns || [];
  const overlapsLeader = (r) => r.rank !== leader.rank && r.ci && leader.ci && r.ci[1] >= leader.ci[0];

  const rows = board.standings.map((r, i) => `
    <tr data-i="${i}">
      <td><div class="rankcell">${medalBadge(r, true, rankLabel(board, r))}</div></td>
      <td><div class="model">${esc(r.model.name)}${overlapsLeader(r) ? '<span class="tie" title="95% interval overlaps the leader\'s">within CI of #1</span>' : ""}
        <small>${esc(r.model.family || "")}</small></div></td>
      <td class="r"><span class="score">${fmtNumber(r.score, d)}</span></td>
      <td class="ci ci-col">${ciSvg(board, r, s, leader)}</td>
      ${cols.map((c, ci) => `<td class="r num stat${ci > 1 ? " opt" : ""}">${fmtCell(r.stats?.[c.key], c)}</td>`).join("")}
    </tr>`).join("");

  const ticks = [s.lo, (s.lo + s.hi) / 2, s.hi].map((v) => `<span>${fmtNumber(v, d)}</span>`).join("");

  return `<div class="board" data-board="${esc(ev.id)}:${esc(board.id)}">
    <div class="board-meta">
      <div><strong>${esc(ev.title)}</strong> <span class="dim">·</span> <span class="muted">${fmtDate(ev.date)}</span> ${statusPill(ev)}</div>
      ${link ? `<a href="event.html?id=${encodeURIComponent(ev.id)}">Full results →</a>` : ""}
    </div>
    ${podiumHTML(board)}
    <div class="table-scroll"><table class="standings">
      <thead><tr>
        <th>#</th><th>Model</th><th class="r">${esc(m.label)}</th>
        <th class="ci-col">95% interval<div class="ci-axis">${ticks}</div></th>
        ${cols.map((c, ci) => `<th class="r stat${ci > 1 ? " opt" : ""}">${esc(c.label)}</th>`).join("")}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="board-foot">${esc(m.method)}. Dashed line marks the leader's score; overlapping intervals mean the order is not yet decisive.</div>
  </div>`;
}

// ---------- Tooltip ----------

function attachTooltips(root, lookup) {
  let tip = document.querySelector(".tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "tip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
  }
  root.addEventListener("mousemove", (e) => {
    const cell = e.target.closest(".ci");
    const tr = cell && cell.closest("tr");
    const boardEl = tr && tr.closest(".board");
    if (!boardEl) { tip.classList.remove("on"); return; }
    const { board } = lookup(boardEl.dataset.board);
    const r = board.standings[+tr.dataset.i];
    const d = board.metric.decimals ?? 0;
    tip.innerHTML = `<b>${esc(r.model.name)}</b>
      <div class="row"><span>${esc(board.metric.label)}</span><span>${fmtNumber(r.score, d)}</span></div>
      ${r.ci ? `<div class="row"><span>95% interval</span><span>${fmtNumber(r.ci[0], d)} – ${fmtNumber(r.ci[1], d)}</span></div>` : ""}
      <div class="row"><span>Rank</span><span>${esc(rankLabel(board, r))}</span></div>`;
    const pad = 14;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > innerHeight - 8) y = e.clientY - h - pad;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
    tip.classList.add("on");
  });
  root.addEventListener("mouseleave", () => tip.classList.remove("on"));
}

function makeLookup(events) {
  const map = new Map();
  for (const ev of events) for (const b of ev.boards) map.set(`${ev.id}:${b.id}`, { ev, board: b });
  return (key) => map.get(key);
}

function sampleBanner(events) {
  if (!events.some((e) => e.sample)) return;
  const el = document.getElementById("banner");
  if (!el) return;
  el.hidden = false;
}

// ---------- Home ----------

function leaderCard(events) {
  const boards = events.flatMap((ev) => ev.boards.map((b) => ({ ev, b })));
  if (!boards.length) return "";
  const { ev, b } = boards[0];
  const [first, second] = b.standings;
  const d = b.metric.decimals ?? 0;
  const sharedTop = b.standings.filter((r) => r.rank === first.rank).length > 1;
  let verdict = "";
  if (sharedTop) {
    verdict = `Shares first place — the evidence does not separate the top contenders.`;
  } else if (second && first.ci && second.ci) {
    const clear = second.ci[1] < first.ci[0];
    const gap = fmtNumber(first.score - second.score, d);
    verdict = clear
      ? `<b>Clear lead</b> of ${gap} over ${esc(second.model.name)}; the 95% intervals do not overlap.`
      : `Leads ${esc(second.model.name)} by ${gap}, but the 95% intervals overlap.`;
  }
  const others = boards.slice(1).map(({ ev: e, b: ob }) => {
    const r = ob.standings[0];
    const shared = ob.standings.filter((x) => x.rank === r.rank).length > 1;
    return `<a href="#standings" data-tab="${esc(e.id)}:${esc(ob.id)}"><span>${esc(ob.title)}</span>
      <span>${esc(r.model.name)}${shared ? " <span class='dim'>(shared)</span>" : ""}</span></a>`;
  }).join("");
  return `<div class="leader">
    <div class="label"><span>Leader · ${esc(b.title)}</span><span>${esc(ev.title)}</span></div>
    <div class="who">${medalBadge(first)}<div><div class="name">${esc(first.model.name)}</div><div class="fam">${esc(first.model.family || "")}</div></div></div>
    <div class="big">${fmtNumber(first.score, d)}<small>${esc(b.metric.label)}</small></div>
    <div class="verdict">${verdict}</div>
    ${others ? `<div class="others">${others}</div>` : ""}
  </div>`;
}

function eventCard(ev) {
  const winners = ev.boards.map((b) => {
    const golds = b.standings.filter((r) => r.medal === "gold");
    return `<div><span class="medal gold sm" aria-hidden="true">1</span><span class="muted">${esc(b.title)}</span>
      <strong>${golds.map((r) => esc(r.model.name)).join(" & ")}</strong></div>`;
  }).join("");
  return `<a class="event-card" href="event.html?id=${encodeURIComponent(ev.id)}">
    <div class="row"><span class="dim num">${fmtDate(ev.date)}</span>${statusPill(ev)}</div>
    <h3>${esc(ev.title)}</h3><p>${esc(ev.summary)}</p>
    <div class="winners">${winners}</div></a>`;
}

async function renderHome() {
  const events = await loadEvents();
  sampleBanner(events);
  const lookup = makeLookup(events);
  document.getElementById("leader").innerHTML = leaderCard(events);

  const boards = events.flatMap((ev) => ev.boards.map((b) => ({ ev, b, key: `${ev.id}:${b.id}` })));
  const tabs = document.getElementById("tabs");
  const panel = document.getElementById("board");
  tabs.innerHTML = boards.map(({ b, key }, i) =>
    `<button class="tab" role="tab" data-key="${esc(key)}" aria-selected="${i === 0}">${esc(b.title)}</button>`).join("");

  const show = (key) => {
    const { ev, board } = lookup(key);
    panel.innerHTML = boardHTML(ev, board);
    for (const t of tabs.children) t.setAttribute("aria-selected", String(t.dataset.key === key));
  };
  tabs.addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (t) show(t.dataset.key); });
  document.getElementById("leader").addEventListener("click", (e) => {
    const a = e.target.closest("[data-tab]"); if (a) show(a.dataset.tab);
  });
  if (boards.length) show(boards[0].key);
  else panel.innerHTML = `<div class="board empty-state">No results published yet.</div>`;
  attachTooltips(panel, lookup);

  document.getElementById("events-list").innerHTML = events.map(eventCard).join("");
}

// ---------- Event page ----------

async function renderEvent() {
  const id = new URLSearchParams(location.search).get("id");
  const events = await loadEvents();
  sampleBanner(events);
  const ev = events.find((e) => e.id === id);
  const main = document.getElementById("event");
  if (!ev) {
    main.innerHTML = `<div class="wrap empty-state"><h2>Event not found</h2><p><a href="./">Back to standings</a></p></div>`;
    return;
  }
  document.title = `${ev.title} · Frontier Games`;
  const evd = ev.evidence;
  const total = evd ? evd.verified + evd.reviewed + evd.unresolved : 0;
  const pct = (n) => (total ? (n / total) * 100 : 0);
  const evidence = total ? `<div class="board"><div class="evidence">
      <h3>Evidence behind scored outcomes</h3>
      <div class="evbar" role="img" aria-label="${evd.verified} verified, ${evd.reviewed} reviewed, ${evd.unresolved} unresolved">
        <span class="v" style="width:${pct(evd.verified)}%"></span><span class="rv" style="width:${pct(evd.reviewed)}%"></span><span class="u" style="width:${pct(evd.unresolved)}%"></span></div>
      <div class="evlegend"><span><i style="background:var(--good)"></i>Verified to specification <b class="num">${evd.verified}</b></span>
        <span><i style="background:var(--warn)"></i>Reviewed <b class="num">${evd.reviewed}</b></span>
        <span><i style="background:var(--dim)"></i>Unresolved (not scored) <b class="num">${evd.unresolved}</b></span></div>
    </div></div>` : "";
  const artifacts = (ev.artifacts || []).map((a) =>
    `<li><span>${a.url ? `<a href="${esc(a.url)}">${esc(a.name)}</a>` : esc(a.name)}</span><code>sha256:${esc(a.sha256)}</code></li>`).join("");

  main.innerHTML = `
    <div class="event-head"><div class="wrap">
      <div class="eyebrow">${esc(ev.track)} · ${statusPill(ev)}</div>
      <h1>${esc(ev.title)}</h1>
      <p class="lede">${esc(ev.summary)}</p>
      <div class="facts">
        <div><span>Date</span>${fmtDate(ev.date)}</div>
        <div><span>Rules</span><code class="num">${esc(ev.rules_version)}</code></div>
        <div><span>Contenders</span><b class="num">${ev.boards[0]?.standings.length ?? 0}</b></div>
        <div><span>Manifest</span><code class="num dim">${esc(String(ev.manifest_digest).slice(0, 23))}…</code></div>
      </div>
    </div></div>
    <section style="padding-top:16px"><div class="wrap stack">
      ${ev.boards.map((b) => `<div><h2 style="margin-bottom:16px">${esc(b.title)}</h2>${boardHTML(ev, b, { link: false })}</div>`).join("")}
      ${evidence}
      ${artifacts ? `<div><h2 style="margin-bottom:16px">Released artifacts</h2><ul class="artifacts">${artifacts}</ul></div>` : ""}
    </div></section>`;
  attachTooltips(main, makeLookup(events));
}

function fail(el, err) {
  console.error(err);
  if (el) el.innerHTML = `<div class="board empty-state">Could not load results (${esc(err.message)}).</div>`;
}

const page = document.body.dataset.page;
if (page === "home") renderHome().catch((e) => fail(document.getElementById("board"), e));
if (page === "event") renderEvent().catch((e) => fail(document.getElementById("event"), e));
