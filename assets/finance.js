// Finance views: Open-Weight Market Arena, Knowledge Horizon profiles and model lineage.
// Loaded before site.js and uses its helpers at call time. Like the rest of the site it
// only renders what the bundles say: returns and labels are never recomputed here.
"use strict";

async function loadFinance({ colors = true } = {}) {
  const index = await getJSON("index.json");
  const [reg, arenas, profiles] = await Promise.all([
    index.models ? getJSON(index.models) : { models: [] },
    Promise.all((index.arena || []).map((a) => getJSON(a.path))),
    Promise.all((index.knowledge || []).map((k) => getJSON(k.path))),
  ]);
  const models = new Map(reg.models.map((m) => [m.id, m]));
  // One colour per entrant, shared by every finance view.
  if (colors) assignColorsFor(reg.models.filter((m) => m.in_arena || m.in_knowledge).map((m) => m.name));
  return { index, registry: reg, models, arenas, profiles, sample: reg.sample || arenas.some((a) => a.sample) || profiles.some((p) => p.sample) };
}

const nameOf = (models, id) => models.get(id)?.name || id;
const pct = (v, d = 1) => `${v > 0 ? "+" : ""}${fmt(v * 100, d)}%`;
const pp = (v, d = 1) => `${v > 0 ? "+" : ""}${fmt(v * 100, d)} pp`;
const plainPct = (v, d = 0) => `${fmt(v * 100, d)}%`;
const CHECKPOINT = { pretrained_base: "Pretrained base", instruction_tuned: "Instruction-tuned", reasoning_tuned: "Reasoning-tuned" };
const DIVISION = { as_shipped: "As-Shipped", financially_adapted: "Financially Adapted" };
const EVIDENCE = {
  prospective_paper_trading: "Prospective paper trading",
  historical_replay: "Historical replay",
  provenance_supported_replay: "Provenance-supported replay",
};
const MARKET = { SE: "Sweden", US: "United States" };

function financeNotice(sample, extra) {
  return `${sample ? `<div class="notice">${icon("info")}<span><b>Sample data.</b> No finance event has run yet. Models, curves and profiles below are fictional and only preview the format.</span></div>` : ""}${extra || ""}`;
}

function modelTip(m) {
  return tipHead(m.name) + tipRow("Checkpoint", CHECKPOINT[m.checkpoint_type] || esc(m.checkpoint_type)) +
    tipRow("Parameters", esc(m.params_active ? `${m.params_total} total · ${m.params_active} active` : m.params_total));
}

// ---------- Line chart (equity curves) ----------

function drawEquity(el, cfg) {
  const { dates, series, band, hidden, mode } = cfg;
  const W = Math.max(300, el.clientWidth), narrow = W < 560;
  const H = narrow ? 280 : 360;
  const m = { l: 44, r: narrow ? 12 : 150, t: 14, b: 30 };
  const tf = (v) => (mode === "drawdown" ? v : v - 100);
  const shown = series.filter((s) => !hidden.has(s.key));
  const vals = shown.flatMap((s) => s.values.map(tf)).concat(band && mode !== "drawdown" ? [...band.p5, ...band.p95].map(tf) : []);
  const sy = niceTicks(Math.min(...vals, 0), Math.max(...vals, 0), 5);
  const n = dates.length;
  const X = (i) => m.l + (i / (n - 1)) * (W - m.l - m.r);
  const Y = (v) => H - m.b - ((v - sy.lo) / (sy.hi - sy.lo)) * (H - m.t - m.b);
  const yd = decimalsFor(sy.step);
  const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(tf(v)).toFixed(1)}`).join("");

  const grid = sy.ticks.map((t) => `<line class="g" x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${fmt(t, yd)}%</text>`).join("");
  const step = Math.ceil(n / (narrow ? 3 : 6));
  const xt = dates.map((d, i) => (i % step === 0 || i === n - 1) && (i === n - 1 || n - 1 - i > step / 2)
    ? `<text x="${X(i)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</text>` : "").join("");
  const bandSvg = band && mode !== "drawdown" && !hidden.has("band")
    ? `<path class="band" d="${band.p95.map((v, i) => `${i ? "L" : "M"}${X(i)},${Y(tf(v))}`).join("")}${band.p5.map((v, i) => `L${X(n - 1 - i)},${Y(tf(band.p5[n - 1 - i]))}`).join("")}Z"/>` : "";
  const lines = shown.map((s) => `<path class="ln${s.baseline ? " base" : ""}" data-k="${esc(s.key)}" style="--c:${s.color}" d="${path(s.values)}"/>`).join("");

  // Direct end labels for model series, nudged apart.
  let labels = "";
  if (!narrow) {
    const ends = shown.map((s) => ({ s, y: Y(tf(s.values[n - 1])) + 4 })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;
    labels = ends.map(({ s, y }) => `<text class="end" x="${W - m.r + 8}" y="${y}" style="fill:${s.baseline ? "var(--muted)" : "var(--text-2)"}">${esc(s.short || s.label)}</text>`).join("");
  }
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Equity curves">
    ${grid}<line class="ax" x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}"/>${xt}${bandSvg}${lines}${labels}
    <line class="xh" y1="${m.t}" y2="${H - m.b}" x1="0" x2="0" visibility="hidden"/><g class="hd"></g>
    <rect class="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/></svg>`;
  el._geom = { X, Y, tf, n, m, W, shown };
}

function wireEquity(el, cfg, onHover) {
  const redraw = () => drawEquity(el, cfg);
  let lastW = 0, raf;
  new ResizeObserver(() => { if (el.clientWidth !== lastW) { lastW = el.clientWidth; cancelAnimationFrame(raf); raf = requestAnimationFrame(redraw); } }).observe(el);
  redraw();
  el.addEventListener("mousemove", (e) => {
    const g = el._geom;
    if (!g) return;
    const svg = el.querySelector("svg");
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * g.W;
    const i = Math.round(((x - g.m.l) / (g.W - g.m.l - g.m.r)) * (g.n - 1));
    if (i < 0 || i >= g.n) { hideTip(); return; }
    const xh = svg.querySelector(".xh");
    xh.setAttribute("x1", g.X(i)); xh.setAttribute("x2", g.X(i)); xh.setAttribute("visibility", "visible");
    svg.querySelector(".hd").innerHTML = g.shown.map((s) => `<circle cx="${g.X(i)}" cy="${g.Y(g.tf(s.values[i]))}" r="4" style="fill:${s.color}"/>`).join("");
    showTip(e, onHover(i, g.shown));
  });
  el.addEventListener("mouseleave", () => {
    hideTip();
    const svg = el.querySelector("svg");
    if (!svg) return;
    svg.querySelector(".xh").setAttribute("visibility", "hidden");
    svg.querySelector(".hd").innerHTML = "";
  });
  return redraw;
}

// ---------- Arena page ----------

function drawdownSeries(values) {
  let peak = values[0];
  return values.map((v) => { peak = Math.max(peak, v); return (v / peak - 1) * 100; });
}

function arenaBody(a, F) {
  const replay = a.evidence_class !== "prospective_paper_trading";
  const rows = a.models;
  const nm = (id) => nameOf(F.models, id);
  const bh = a.baselines.find((b) => b.id === "buy_and_hold");
  const kh = F.profiles[0];
  const khSummary = (id) => {
    if (!kh) return "";
    const year = a.start.slice(0, 4);
    const cells = kh.cells.filter((c) => c.model === id && c.region === a.market && c.period === year && c.fact_type === "return" && c.elicitation === "first_attempt");
    if (!cells.length) return '<span class="muted">No profile for this period</span>';
    return cells.map((c) => `<span class="kh-chip ${c.label}" title="${esc(c.stratum)} caps">${esc(c.stratum)}: ${esc(LABELS[c.label].short)}</span>`).join(" ");
  };

  const list = replay ? "" : `<section class="sec" id="standings">
      <div class="sec-h"><div><h2>${icon("trophy")}Standings</h2>
        <p>Ranked by net return over ${a.models[0].metrics.sessions} sessions. <b>Exhibition:</b> a season this short cannot separate skill from luck, so compare each model with the random-ranking range.</p></div></div>
      <div class="rank-list"><ol>${rows.slice(0, Math.ceil(rows.length / 2)).map((r) => arenaItem(r, F)).join("")}</ol><ol>${rows.slice(Math.ceil(rows.length / 2)).map((r) => arenaItem(r, F)).join("")}</ol></div>
    </section>`;

  const cols = [["net_return", "Net return", (v) => pct(v)], ["vs_buy_and_hold", "vs buy & hold", (v) => pp(v)], ["max_drawdown", "Max drawdown", (v) => pct(v)],
    ["volatility", "Volatility (ann.)", (v) => plainPct(v, 1)], ["exposure", "Avg exposure", (v) => plainPct(v)], ["turnover", "Turnover / session", (v) => plainPct(v, 1)],
    ["costs", "Costs", (v) => plainPct(v, 2)], ["violations", "Rule violations", (v) => v], ["format_failures", "Format failures", (v) => v], ["gpu_hours", "GPU hours", (v) => fmt(v, 1)]];
  const table = `<section class="sec" id="metrics">
      <div class="sec-h"><div><h2>${icon("table")}Metrics</h2><p>Computed by the market engine from recorded decisions. Rule violations are rejected orders: positions were kept and the violation recorded, never silently repaired.</p></div></div>
      <div class="card tbl-wrap"><table class="stats">
        <thead><tr><th>${replay ? "" : "#"}</th><th>Model</th><th>Status</th>${cols.map((c) => `<th>${c[1]}</th>`).join("")}${replay ? "<th>Knowledge profile (returns, first attempt)</th>" : ""}</tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${replay ? "" : r.rank}</td>
          <td><span style="display:inline-flex;align-items:center;gap:8px"><span class="dot" style="--c:${colorOf(nm(r.model))}"></span>${esc(nm(r.model))}</span></td>
          <td><span class="pill">${esc(r.status)}</span></td>
          ${cols.map((c) => `<td class="${c[0] === "net_return" || c[0] === "vs_buy_and_hold" ? (r.metrics[c[0]] >= 0 ? "up" : "down") : ""}">${c[2](r.metrics[c[0]])}</td>`).join("")}
          ${replay ? `<td style="text-align:left">${khSummary(r.model)}</td>` : ""}</tr>`).join("")}
          ${a.baselines.map((b) => `<tr class="baseline-row"><td></td><td><span style="display:inline-flex;align-items:center;gap:8px"><span class="dash-swatch"></span>${esc(b.label)}</span></td><td><span class="pill">baseline</span></td>
            <td class="${b.equity[b.equity.length - 1] >= 100 ? "up" : "down"}">${pct(b.equity[b.equity.length - 1] / 100 - 1)}</td>${cols.slice(1).map(() => '<td class="muted">—</td>').join("")}${replay ? "<td></td>" : ""}</tr>`).join("")}
        </tbody></table></div>
    </section>`;

  const rules = `<section class="sec" id="rules">
      <div class="sec-h"><div><h2>${icon("book")}Cohort rules</h2><p>Frozen before the first session. All models get the same market packet each session; their portfolios differ only through their own decisions.</p></div></div>
      <div class="card"><dl class="rules">
        <div><dt>Evidence class</dt><dd>${esc(EVIDENCE[a.evidence_class])}</dd></div>
        <div><dt>Division</dt><dd>${esc(DIVISION[a.division])}</dd></div>
        <div><dt>Market</dt><dd>${esc(MARKET[a.market] || a.market)} · ${esc(a.currency)}, equal starting capital of ${Number(a.initial_equity).toLocaleString("en-US")} ${esc(a.currency)}</dd></div>
        <div><dt>Period</dt><dd>${fmtDate(a.start)} – ${fmtDate(a.end)} · ${a.models[0].metrics.sessions} sessions</dd></div>
        <div><dt>Universe</dt><dd>${esc(a.rules.universe)}</dd></div>
        <div><dt>Positions</dt><dd>${esc(a.rules.positions)}</dd></div>
        <div><dt>Fills</dt><dd>${esc(a.rules.fill)}</dd></div>
        <div><dt>Costs</dt><dd>${esc(a.rules.costs)}</dd></div>
        <div><dt>Knockout</dt><dd>${esc(a.rules.knockout)}</dd></div>
        ${replay ? "" : `<div><dt>Commitments</dt><dd>${a.commitments.published} decision hashes published before their fills · ${a.commitments.late} late</dd></div>`}
        <div><dt>Not published</dt><dd>Holdings, trades and individual decisions. Only returns and metrics are shown.</dd></div>
      </dl></div>
    </section>`;

  return { list, table, rules };
}

function arenaItem(r, F) {
  const m = F.models.get(r.model) || { name: r.model };
  const x = r.metrics;
  return `<li class="ri">
    <span class="n num">${r.rank}.</span>${avatar({ model: m })}
    <span class="nm"><b><a href="models.html#${esc(r.model)}">${esc(m.name)}</a></b><span>by ${esc(m.family || "unknown")} · ${esc(CHECKPOINT[m.checkpoint_type] || "")}</span></span>
    <span class="val"><b class="num ${x.net_return >= 0 ? "up" : "down"}">${x.net_return >= 0 ? "↑" : "↓"}${fmt(Math.abs(x.net_return * 100), 1)}%<span class="dot" style="--c:${colorOf(m.name)}"></span></b>
      <small class="num">${pp(x.vs_buy_and_hold)} vs buy &amp; hold</small>
      ${x.within_random_band ? '<span class="tag" title="Final value is inside the 5th–95th percentile of random-ranking portfolios">within random range</span>' : ""}</span></li>`;
}

async function renderArena() {
  const F = await loadFinance();
  const main = $("#main");
  if (!F.arenas.length) {
    main.innerHTML = `<div class="page-head"><h1>Open-Weight Market Arena</h1></div><div class="card empty">No arena results published yet.</div>`;
    renderSide([]);
    return;
  }
  const prospective = F.arenas.filter((a) => a.evidence_class === "prospective_paper_trading");
  const replays = F.arenas.filter((a) => a.evidence_class !== "prospective_paper_trading");
  const tabs = [...prospective.map((a) => ({ id: a.id, label: MARKET[a.market] || a.market })), ...replays.map((a) => ({ id: a.id, label: "Historical replay", replay: true }))];
  let current = new URLSearchParams(location.search).get("cohort") || tabs[0].id;
  if (!F.arenas.some((a) => a.id === current)) current = tabs[0].id;

  main.innerHTML = `
    <div class="page-head">
      <h1>Open-Weight Market Arena</h1>
      <p>Downloadable models make sequential stock-selection and portfolio decisions from the same point-in-time market packet, without tools. Every entrant is an exact checkpoint that we host and hash, so results can be tied to weights anyone can download. <a href="method.html#arena">How the arena works</a></p>
      <div class="meta">As-Shipped division · long-only, unlevered · equal starting capital per cohort</div>
      ${financeNotice(F.sample)}
    </div>
    <div class="cohort-bar"><div class="seg" role="tablist" aria-label="Cohort">${tabs.map((t) => `<button data-cohort="${esc(t.id)}" aria-pressed="${t.id === current}">${t.replay ? icon("history") : ""}${esc(t.label)}</button>`).join("")}</div></div>
    <div id="cohort"></div>`;

  const show = (id) => {
    current = id;
    for (const b of main.querySelectorAll("[data-cohort]")) b.setAttribute("aria-pressed", String(b.dataset.cohort === id));
    history.replaceState(null, "", `?cohort=${encodeURIComponent(id)}${location.hash}`);
    renderCohort(F.arenas.find((a) => a.id === id), F);
  };
  main.querySelector(".cohort-bar").addEventListener("click", (e) => { const b = e.target.closest("[data-cohort]"); if (b) show(b.dataset.cohort); });
  show(current);
}

function renderCohort(a, F) {
  const replay = a.evidence_class !== "prospective_paper_trading";
  const nm = (id) => nameOf(F.models, id);
  const parts = arenaBody(a, F);
  const series = [
    ...a.models.map((r) => ({ key: r.model, label: nm(r.model), short: nm(r.model).replace(/^Sample /, ""), color: colorOf(nm(r.model)), values: r.equity })),
    ...a.baselines.filter((b) => b.id !== "cash").map((b) => ({ key: b.id, label: b.label, short: b.id === "buy_and_hold" ? "Buy & hold" : "Index", color: "var(--muted)", values: b.equity, baseline: true })),
  ];
  const cfg = { dates: a.dates, series, band: a.random_band, hidden: new Set(), mode: "indexed" };
  const replayNote = replay ? `<div class="notice replay-note">${icon("history")}<span><b>Retrospective and exploratory.</b> These decisions were replayed over past outcomes that a model may already know. Replay is never ranked, has its own capital accounts, and never carries over into a live record. Read it next to each model's <a href="knowledge.html">knowledge profile</a>.</span></div>` : "";

  $("#cohort").innerHTML = `${replayNote}
    <section class="sec" id="equity" style="padding-top:24px">
      <div class="sec-h"><div><h2>${icon("trend")}${esc(a.title)}</h2>
        <p>${replay ? "Replayed" : "Paper-traded"} value of each model's portfolio, indexed to 100 at the start, after fees and costs. Grey lines are baselines run through the same executor; the shaded band is where random stock rankings ended up.</p></div>
        <div class="seg" role="group" aria-label="Chart"><button data-mode="indexed" aria-pressed="true">Return</button><button data-mode="drawdown" aria-pressed="false">Drawdown</button></div></div>
      <div class="card ${replay ? "replay" : ""}">
        <div class="card-h"><span>${esc(EVIDENCE[a.evidence_class])} · ${fmtDate(a.start)} – ${fmtDate(a.end)}</span><span class="pill ${esc(a.status)}">${esc(a.status)}</span></div>
        <div class="chips" role="group" aria-label="Series">${series.map((s) => `<button class="chip" data-key="${esc(s.key)}" aria-pressed="true" style="--c:${s.color}"><span class="${s.baseline ? "dash-swatch" : "dot"}"></span>${esc(s.label)}</button>`).join("")}
          <button class="chip" data-key="band" aria-pressed="true"><span class="band-swatch"></span>${esc(a.random_band.label)}</button></div>
        <div class="equity" data-plot></div>
        <div class="chart-foot"><span>Hover for values on a date. Click a legend item to hide it.</span><span>Cash stays at 0%</span></div>
      </div>
    </section>
    ${parts.list}${parts.table}${parts.rules}`;

  const el = $("#cohort [data-plot]");
  const redraw = wireEquity(el, cfg, (i, shown) => {
    const rows = shown.map((s) => ({ s, v: cfg.mode === "drawdown" ? s.values[i] : s.values[i] - 100 })).sort((x, y) => y.v - x.v);
    const band = cfg.mode === "drawdown" || cfg.hidden.has("band") ? "" : tipRow("Random range", `${fmt(a.random_band.p5[i] - 100, 1)}% – ${fmt(a.random_band.p95[i] - 100, 1)}%`);
    return `<div class="h">${fmtDate(a.dates[i])}</div>` + rows.map(({ s, v }) =>
      `<div class="r"><span style="display:inline-flex;align-items:center;gap:6px"><span class="${s.baseline ? "dash-swatch" : "dot"}" style="--c:${s.color}"></span>${esc(s.short || s.label)}</span><b>${v > 0 ? "+" : ""}${fmt(v, 1)}%</b></div>`).join("") + band;
  });
  const base = series.map((s) => ({ ...s }));
  $("#cohort").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) {
      const k = chip.dataset.key;
      cfg.hidden.has(k) ? cfg.hidden.delete(k) : cfg.hidden.add(k);
      chip.setAttribute("aria-pressed", String(!cfg.hidden.has(k)));
      redraw();
    }
    const mode = e.target.closest("[data-mode]");
    if (mode) {
      cfg.mode = mode.dataset.mode;
      for (const b of $("#cohort").querySelectorAll("[data-mode]")) b.setAttribute("aria-pressed", String(b === mode));
      cfg.series = base.map((s) => ({ ...s, values: cfg.mode === "drawdown" ? drawdownSeries(s.values) : s.values }));
      redraw();
    }
  });
  renderSide([{ id: "equity", label: replay ? "Replay curves" : "Equity", icon: "trend" },
    ...(replay ? [] : [{ id: "standings", label: "Standings", icon: "trophy" }]),
    { id: "metrics", label: "Metrics", icon: "table" }, { id: "rules", label: "Cohort rules", icon: "book" }],
    [["knowledge.html", "horizon", "Knowledge Horizon"], ["models.html", "tree", "Models"], ["method.html#arena", "book", "Method"]]);
}

// ---------- Knowledge Horizon page ----------

const LABELS = {
  DETECTED_EXPOSURE: { short: "exposure detected", mark: "●", text: "Verified recovery of information that was not available at the simulated decision time." },
  NO_EXPOSURE_DETECTED: { short: "none detected", mark: "○", text: "This sample did not detect recovery. That is not proof of absence." },
  INSUFFICIENT_COVERAGE: { short: "insufficient coverage", mark: "–", text: "Too few or too narrow probes for a meaningful assessment." },
  UNRESOLVED: { short: "unresolved", mark: "?", text: "Reference, execution or adjudication problems prevent interpretation." },
};

async function renderKnowledge() {
  const F = await loadFinance();
  const main = $("#main");
  const kh = F.profiles[0];
  if (!kh) {
    main.innerHTML = `<div class="page-head"><h1>Knowledge Horizon</h1></div><div class="card empty">No knowledge profiles published yet.</div>`;
    renderSide([]);
    return;
  }
  const state = { fact: kh.fact_types[1]?.id || kh.fact_types[0].id, el: kh.elicitations[0].id };
  const byKey = new Map(kh.cells.map((c) => [`${c.model}|${c.region}|${c.stratum}|${c.period}|${c.fact_type}|${c.elicitation}`, c]));

  main.innerHTML = `
    <div class="page-head">
      <h1>Knowledge Horizon <span class="pill ${esc(kh.status)}">${esc(kh.status)}</span></h1>
      <p>What dated financial facts can each exact checkpoint recover, and where could that knowledge leak into a historical backtest? This is a <b>diagnostic, not a contest</b>: there is no ranking and no medal for remembering the most. <a href="method.html#knowledge">How profiles are measured</a></p>
      <div class="meta">Protocol <span class="mono">${esc(kh.protocol_id)}</span> · ${esc(kh.title)} · ${fmtDate(kh.date)}</div>
      ${financeNotice(F.sample, `<div class="notice neutral">${icon("shield")}<span>Diagnostic evidence, not a certificate of backtest safety. "None detected" means this sample and protocol found nothing. It never means a period is clean.</span></div>`)}
    </div>
    <div class="filters">
      <div><span class="flabel">Fact type</span><div class="seg" data-f="fact">${kh.fact_types.map((f) => `<button data-v="${esc(f.id)}" aria-pressed="${f.id === state.fact}">${esc(f.label)}</button>`).join("")}</div></div>
      <div><span class="flabel">Elicitation</span><div class="seg" data-f="el">${kh.elicitations.map((f) => `<button data-v="${esc(f.id)}" aria-pressed="${f.id === state.el}">${esc(f.label)}</button>`).join("")}</div></div>
    </div>
    <div class="kh-legend card">
      <div class="legend-seq"><span>Measured recall</span><span class="num">0%</span><i></i><span class="num">100%</span></div>
      <div class="legend">${Object.entries(LABELS).map(([k, l]) => `<span><b class="kh-mark ${k}">${l.mark}</b>${esc(l.short[0].toUpperCase() + l.short.slice(1))}</span>`).join("")}
        <span><span class="after-swatch"></span>Facts after the checkpoint was available (natural negative control)</span></div>
    </div>
    <div id="kh-grid" class="kh-grid"></div>
    <section class="sec" id="reading">
      <div class="sec-h"><div><h2>${icon("book")}How to read a profile</h2></div></div>
      <div class="card prose-card">
        <p>Each cell counts verified correct answers on sampled facts from one market segment and period, answered without tools in a fresh context. Cells use the same facts for every model, and each shows its sample size and a 95% interval on hover.</p>
        <p>Columns after a checkpoint became available are a check on the method: a model cannot have seen those facts, so recall there should sit near the matched baseline.</p>
        <p class="quote">Under protocol ${esc(kh.protocol_id)}, this checkpoint showed limited detectable recall for the sampled Swedish small-cap facts in the stated period. The sample supports further exploratory testing; it does not certify an uncontaminated historical window.</p>
        <p>That is the strongest statement a "none detected" cell supports. There is no "safe before" date and no contamination-adjusted return.</p>
      </div>
    </section>`;

  const draw = () => {
    $("#kh-grid").innerHTML = kh.models.map((id) => {
      const m = F.models.get(id) || { name: id };
      const head = kh.periods.map((p) => {
        const after = m.available_at && p.start > m.available_at;
        return `<th class="${after ? "after" : ""}">${esc(p.id)}</th>`;
      }).join("");
      const rows = kh.strata.map((s) => `<tr><th>${esc(s.label)}</th>${kh.periods.map((p) => {
        const c = byKey.get(`${id}|${s.region}|${s.stratum}|${p.id}|${state.fact}|${state.el}`);
        if (!c) return '<td class="kh-cell none">·</td>';
        const t = Math.round(c.recall * 100);
        const ink = t > 55 ? "#fff" : "var(--text)";
        const bg = c.label === "INSUFFICIENT_COVERAGE" || c.label === "UNRESOLVED" ? "" : `background:color-mix(in oklab, var(--seq-hi) ${t}%, var(--seq-lo));color:${ink}`;
        return `<td class="kh-cell ${c.label}${c.after_availability ? " after" : ""}" style="${bg}" data-k="${esc(id)}|${esc(s.region)}|${esc(s.stratum)}|${esc(p.id)}">
          <span class="v">${c.label === "INSUFFICIENT_COVERAGE" || c.label === "UNRESOLVED" ? "n=" + c.facts : t + "%"}</span><span class="kh-mark">${LABELS[c.label].mark}</span></td>`;
      }).join("")}</tr>`).join("");
      return `<div class="card kh-card" id="kh-${esc(id)}" style="--c:${colorOf(m.name)}">
        <div class="kh-h"><div><b><span class="dot"></span>${esc(m.name)}</b>
          <span>${esc(CHECKPOINT[m.checkpoint_type] || "")} · declared cutoff ${m.declared_cutoff ? `${esc(m.declared_cutoff)} <span class="muted">(${esc(m.cutoff_source)})</span>` : '<span class="muted">not declared</span>'} · available ${fmtDate(m.available_at)}</span></div>
          <a href="models.html#${esc(id)}">Lineage →</a></div>
        <div class="tbl-wrap"><table class="kh"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }).join("");
  };
  draw();

  main.querySelector(".filters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]");
    if (!b) return;
    const seg = b.closest("[data-f]");
    state[seg.dataset.f] = b.dataset.v;
    for (const x of seg.querySelectorAll("[data-v]")) x.setAttribute("aria-pressed", String(x === b));
    draw();
  });
  $("#kh-grid").addEventListener("mousemove", (e) => {
    const td = e.target.closest("td[data-k]");
    if (!td) return hideTip();
    const [id, region, stratum, period] = td.dataset.k.split("|");
    const c = byKey.get(`${id}|${region}|${stratum}|${period}|${state.fact}|${state.el}`);
    const m = F.models.get(id) || { name: id };
    const L = LABELS[c.label];
    showTip(e, tipHead(m.name) +
      `<div class="r"><span>${esc(kh.strata.find((s) => s.region === region && s.stratum === stratum).label)} · ${esc(period)}</span></div>` +
      tipRow("Facts / responses", `${c.facts} / ${c.responses}`) +
      tipRow("Measured recall", `${plainPct(c.recall)} <span class="muted">(${plainPct(c.ci[0])}–${plainPct(c.ci[1])})</span>`) +
      tipRow("Matched baseline", plainPct(c.baseline)) +
      (c.detection_upper_bound !== undefined ? tipRow("Excess detection ≤", `${plainPct(c.detection_upper_bound, 1)} (95%)`) : "") +
      `<div class="tip-label"><b class="kh-mark ${c.label}">${L.mark}</b> <span>${esc(L.text)}</span></div>` +
      (c.after_availability ? '<div class="tip-note">Facts after this checkpoint was available: a natural negative control.</div>' : ""));
  });
  $("#kh-grid").addEventListener("mouseleave", hideTip);

  renderSide([...kh.models.map((id) => ({ id: `kh-${id}`, label: (F.models.get(id)?.name || id).replace(/^Sample /, ""), icon: "horizon" })),
    { id: "reading", label: "How to read", icon: "book" }],
    [["arena.html", "trend", "Market Arena"], ["models.html", "tree", "Models"], ["method.html#knowledge", "book", "Method"]]);
}

// ---------- Models & lineage page ----------

async function renderModels() {
  const F = await loadFinance();
  const all = F.registry.models;
  const children = new Map();
  for (const m of all) for (const p of m.parents || []) {
    if (!children.has(p.id)) children.set(p.id, []);
    children.get(p.id).push({ m, relation: p.relation });
  }
  const roots = all.filter((m) => !(m.parents || []).some((p) => F.models.has(p.id)));
  let filter = "all";

  const node = (m, relation, depth) => {
    const kids = children.get(m.id) || [];
    const visible = filter === "all" || m.division === filter || kids.some((k) => filter === k.m.division);
    const parent = (m.parents || [])[0];
    return `${visible ? `<details class="lin" id="${esc(m.id)}" style="--d:${depth};--c:${colorOf(m.name)}">
      <summary>
        ${depth ? `<span class="lin-rel">${icon("tree")}${esc(relation)}</span>` : ""}
        ${avatar({ model: m })}
        <span class="lin-name"><b>${esc(m.name)}</b><span>by ${esc(m.family)} · ${esc(m.params_active ? `${m.params_total} total, ${m.params_active} active` : m.params_total)} · ${esc(m.quantization)}</span></span>
        <span class="lin-tags">
          <span class="pill">${esc(CHECKPOINT[m.checkpoint_type] || m.checkpoint_type)}</span>
          <span class="pill div-${esc(m.division)}">${esc(DIVISION[m.division])}</span>
          ${m.in_arena ? `<a class="pill link" href="arena.html">Arena</a>` : ""}${m.in_knowledge ? `<a class="pill link" href="knowledge.html#kh-${esc(m.id)}">Profile</a>` : ""}
        </span>
        ${icon("chevron")}
      </summary>
      <dl class="rules">
        <div><dt>Revision</dt><dd class="mono">${esc(m.revision)}</dd></div>
        <div><dt>Weights SHA-256</dt><dd class="mono muted">${esc(m.weights_sha256.slice(0, 16))}…</dd></div>
        <div><dt>License</dt><dd>${esc(m.license)}${m.access === "gated" ? ' <span class="pill">access-gated</span>' : ""}</dd></div>
        <div><dt>Declared cutoff</dt><dd>${m.declared_cutoff ? `${esc(m.declared_cutoff)} <span class="muted">(${esc(m.cutoff_source)})</span>` : '<span class="muted">Not declared, recorded as unknown</span>'}</dd></div>
        <div><dt>Available since</dt><dd>${fmtDate(m.available_at)}</dd></div>
        <div><dt>Financial adaptation</dt><dd>${m.financial_adaptation === "none" ? "None" : esc(m.financial_adaptation.replace(/_/g, " "))}</dd></div>
        ${parent ? `<div><dt>Parent</dt><dd><a href="#${esc(parent.id)}">${esc(nameOf(F.models, parent.id))}</a> · ${esc(parent.relation)}</dd></div>` : ""}
        ${m.note ? `<div><dt>Note</dt><dd>${esc(m.note)}</dd></div>` : ""}
      </dl></details>` : ""}${kids.map((k) => node(k.m, k.relation, depth + 1)).join("")}`;
  };

  $("#main").innerHTML = `
    <div class="page-head">
      <h1>Models &amp; lineage</h1>
      <p>Every finance entrant is an exact, downloadable checkpoint: a revision, weight and tokenizer hashes, quantization, serving setup and prompt template. A fine-tune, merge or quantized copy is a new entrant, linked to its parent so you can tell as-shipped ability apart from improvement after financial training.</p>
      ${financeNotice(F.sample)}
    </div>
    <div class="filters"><div><span class="flabel">Division</span><div class="seg" data-f="div">
      <button data-v="all" aria-pressed="true">All</button><button data-v="as_shipped" aria-pressed="false">As-Shipped</button><button data-v="financially_adapted" aria-pressed="false">Financially Adapted</button></div></div></div>
    <section class="sec" id="lineage" style="padding-top:20px"><div class="card lin-tree" id="tree"></div>
      <p class="muted" style="font-size:13.5px;margin-top:12px">The Financially Adapted division does not run yet: adapted checkpoints are registered for lineage only. Controlled parent–child adaptation experiments come later.</p></section>`;
  const draw = () => { $("#tree").innerHTML = roots.map((m) => node(m, "", 0)).join("") || '<div class="empty">No models in this division.</div>'; };
  draw();
  $(".filters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]");
    if (!b) return;
    filter = b.dataset.v;
    for (const x of b.parentElement.querySelectorAll("[data-v]")) x.setAttribute("aria-pressed", String(x === b));
    draw();
  });
  if (location.hash) { const d = document.getElementById(location.hash.slice(1)); if (d) { d.open = true; d.scrollIntoView(); } }
  renderSide([{ id: "lineage", label: "Lineage", icon: "tree" }],
    [["arena.html", "trend", "Market Arena"], ["knowledge.html", "horizon", "Knowledge Horizon"], ["method.html#lineage", "book", "Method"]]);
}

// ---------- Home teaser ----------

async function financeTeaser() {
  let F;
  try { F = await loadFinance({ colors: false }); } catch { return ""; }
  const pros = F.arenas.filter((a) => a.evidence_class === "prospective_paper_trading");
  if (!pros.length && !F.profiles.length) return "";
  const cards = pros.map((a) => {
    const top = a.models[0];
    const m = F.models.get(top.model) || { name: top.model };
    const bh = a.baselines.find((b) => b.id === "buy_and_hold");
    return `<a class="lead-card" href="arena.html?cohort=${encodeURIComponent(a.id)}">
      <div class="t"><span style="display:inline-flex;gap:7px;align-items:center">${icon("trend")}Market Arena · ${esc(MARKET[a.market] || a.market)}</span><span class="pill ${esc(a.status)}">${esc(a.status)}</span></div>
      <div class="who">${avatar({ model: m })}<div><div class="name">${esc(m.name)}</div><div class="by">by ${esc(m.family || "unknown")}</div></div></div>
      <div class="score num ${top.metrics.net_return >= 0 ? "up" : "down"}">${pct(top.metrics.net_return)}<small>net return</small></div>
      <div class="v">Buy &amp; hold ${pct(bh.equity[bh.equity.length - 1] / 100 - 1)}${top.metrics.within_random_band ? " · within random range" : ""}</div></a>`;
  }).join("");
  const kh = F.profiles[0];
  const khCard = kh ? `<a class="lead-card diag" href="knowledge.html">
      <div class="t"><span style="display:inline-flex;gap:7px;align-items:center">${icon("horizon")}Knowledge Horizon</span><span class="pill ${esc(kh.status)}">${esc(kh.status)}</span></div>
      <div class="who"><div><div class="name">Diagnostic, not ranked</div><div class="by">${kh.models.length} checkpoints · ${kh.strata.length} market segments · ${kh.periods.length} periods</div></div></div>
      <div class="v">Which dated financial facts each checkpoint can recover, and where that could leak into a backtest.</div></a>` : "";
  const sample = F.sample ? " Sample data." : "";
  return `<section class="sec" id="finance">
    <div class="sec-h"><div><h2>${icon("trend")}Finance</h2>
      <p>Open-weight models trading on common point-in-time data, next to a diagnostic of what each one already knows about the past. Arena results are exhibition until the season is long enough to separate skill from luck.${sample}</p></div>
      <a class="btn-link" href="arena.html">Open the arena ${icon("chevron")}</a></div>
    <div class="leaders">${cards}${khCard}</div></section>`;
}
