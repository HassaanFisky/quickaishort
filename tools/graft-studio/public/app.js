import {
  blastRadius,
  buildStudioModel,
  hotspots,
  neighborhood,
  parseSpan,
  searchModel,
} from "/lib/model.mjs";
import { layoutArchitecture, layoutCluster, layoutNeighborhood } from "/lib/layout.mjs";

const $ = (id) => document.getElementById(id);
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = $("canvas");
const mini = $("mini");
const ctx = canvas.getContext("2d");
const mctx = mini.getContext("2d");

const PALETTE = {
  bg: "#0a0a0a",
  region: "rgba(23,23,26,0.55)",
  regionLine: "#26262b",
  node: "#17171a",
  stroke: "#26262b",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  accent: "#a855f7",
  inbound: "#67e8f9",
  dimEdge: "rgba(161,161,170,0.22)",
};

const state = {
  model: null,
  level: "architecture",
  clusterId: null,
  focusId: null,
  systemFilter: new URLSearchParams(location.search).get("system") || "",
  hops: 1,
  query: "",
  hits: [],
  hitIndex: 0,
  hover: null,
  camera: { x: 0, y: 0, k: 1 },
  target: { x: 0, y: 0, k: 1 },
  nodes: [],
  edges: [],
  regions: [],
  hiddenIn: 0,
  hiddenOut: 0,
  drag: null,
  moved: false,
  dirty: true,
};

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.floor(r.width * dpr);
  canvas.height = Math.floor(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.dirty = true;
}

function worldFromEvent(ev, target = canvas) {
  const r = target.getBoundingClientRect();
  const sx = ev.clientX - r.left;
  const sy = ev.clientY - r.top;
  return {
    x: (sx - state.camera.x) / state.camera.k,
    y: (sy - state.camera.y) / state.camera.k,
    sx,
    sy,
  };
}

function hitTest(x, y) {
  for (let i = state.nodes.length - 1; i >= 0; i -= 1) {
    const n = state.nodes[i];
    const dx = x - n.x;
    const dy = y - n.y;
    if (dx * dx + dy * dy <= (n.r + 12) * (n.r + 12)) return n;
    const labelW = Math.max(36, n.label.length * 6.2);
    if (Math.abs(dx) <= labelW / 2 && y >= n.y + n.r && y <= n.y + n.r + 20) return n;
  }
  return null;
}

function connectedIds(focusId) {
  const ids = new Set([focusId]);
  if (!focusId) return ids;
  for (const e of state.edges) {
    if (e.source === focusId) ids.add(e.target);
    if (e.target === focusId) ids.add(e.source);
  }
  return ids;
}

function setGraph(nodes, edges, regions = [], extra = {}) {
  state.nodes = nodes;
  state.edges = edges;
  state.regions = regions;
  state.hiddenIn = extra.hiddenIn || 0;
  state.hiddenOut = extra.hiddenOut || 0;
  fitCamera(nodes, regions, extra.maxK);
  state.dirty = true;
}

function boundsOf(nodes, regions) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of regions || []) {
    minX = Math.min(minX, r.x);
    maxX = Math.max(maxX, r.x + r.w);
    minY = Math.min(minY, r.y);
    maxY = Math.max(maxY, r.y + r.h);
  }
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.r);
    maxX = Math.max(maxX, n.x + n.r);
    minY = Math.min(minY, n.y - n.r);
    maxY = Math.max(maxY, n.y + n.r);
  }
  if (!Number.isFinite(minX)) return { minX: -200, minY: -160, maxX: 200, maxY: 160 };
  return { minX, minY, maxX, maxY };
}

function fitCamera(nodes, regions, maxK = 1.2) {
  const r = canvas.getBoundingClientRect();
  const b = boundsOf(nodes, regions);
  const w = b.maxX - b.minX || 1;
  const h = b.maxY - b.minY || 1;
  const k = Math.min(r.width / (w + 240), r.height / (h + 180), maxK);
  state.target = {
    k,
    x: r.width / 2 - ((b.minX + b.maxX) / 2) * k,
    y: r.height / 2 - ((b.minY + b.maxY) / 2) * k,
  };
  if (reduced) state.camera = { ...state.target };
}

function showArchitecture() {
  state.level = "architecture";
  state.clusterId = null;
  state.focusId = null;
  const g = layoutArchitecture(state.model, state.systemFilter);
  setGraph(g.nodes, g.edges, g.regions, { maxK: 1.05 });
  const spots = hotspots(state.model, 6).filter((c) => !state.systemFilter || c.system === state.systemFilter);
  renderSheet({
    title: state.systemFilter || "Architecture",
    meta: state.systemFilter
      ? `${g.nodes.length} clusters in ${state.systemFilter}`
      : `${state.model.meta.fileCount} files · ${state.model.clusters.length} clusters · ${state.model.systems.length} systems`,
    rows: state.model.systems
      .filter((s) => !state.systemFilter || s.key === state.systemFilter)
      .map((s) => [s.label, `${s.fileCount} files`]),
    hotspots: spots.map((c) => ({
      id: c.id,
      name: c.label,
      rel: `${c.system} · coupling ${c.coupling}`,
    })),
  });
  $("hudHint").textContent = "Territories are systems. Larger nodes hold more files. Thicker links are real coupling, not decoration.";
  renderSystems();
}

function showCluster(clusterId) {
  state.level = "cluster";
  state.clusterId = clusterId;
  state.focusId = null;
  const g = layoutCluster(state.model, clusterId);
  setGraph(g.nodes, g.edges, [], { maxK: 0.88 });
  const c = state.model.clusterById.get(clusterId);
  renderSheet({
    title: c.label,
    meta: `${c.system} · ${c.fileCount} files · ${c.symbolCount} symbols`,
    rows: [
      ["Outbound coupling", String(c.outWeight)],
      ["Inbound coupling", String(c.inWeight)],
      ["Hub file", state.model.byId.get(c.hubFileId)?.name || "—"],
    ],
    actions: [{ id: "up", label: "Back to architecture" }],
  });
  $("hudHint").textContent = "Hubs sit inward. Zoom or hover for quieter files. Click a file to trace impact.";
}

function showFocus(id) {
  const nb = neighborhood(state.model, id, state.hops);
  if (!nb) return;
  state.level = "focus";
  state.focusId = id;
  const clusterId = state.model.fileToCluster.get(state.model.fileOf.get(id));
  if (clusterId) state.clusterId = clusterId;
  const g = layoutNeighborhood(nb, 12);
  setGraph(g.nodes, g.edges, [], { hiddenIn: g.hiddenIn, hiddenOut: g.hiddenOut, maxK: 1.25 });
  void fillInspector(nb, g);
  $("hudHint").textContent = "Left is inbound (change impact). Right is outbound (what this uses). Esc returns.";
}

async function fillInspector(nb, layout) {
  const blast = blastRadius(state.model, nb.center.id);
  const span = parseSpan(nb.center.span);
  let source = "";
  try {
    const res = await fetch(
      `/api/source?path=${encodeURIComponent(nb.center.path)}&start=${span.start}&end=${Math.min(span.end, span.start + 18)}`,
    );
    if (res.ok) {
      const data = await res.json();
      source = data.text || "";
    }
  } catch {
    source = "";
  }
  renderSheet({
    title: nb.center.name,
    meta: `${nb.center.kind} · ${nb.center.path} ${nb.center.span || ""}`,
    rows: [
      ["Depends on", `${nb.outbound.length}${layout.hiddenOut ? ` (${layout.hiddenOut} hidden)` : ""}`],
      ["Depended on by", `${nb.inbound.length}${layout.hiddenIn ? ` (${layout.hiddenIn} hidden)` : ""}`],
      ["File blast out", String(blast.outbound.length)],
      ["File blast in", String(blast.inbound.length)],
    ],
    inbound: nb.inbound.slice(0, 14).map((x) => ({
      id: x.id,
      name: state.model.byId.get(x.id)?.name || x.id,
      rel: x.relation,
    })),
    outbound: nb.outbound.slice(0, 14).map((x) => ({
      id: x.id,
      name: state.model.byId.get(x.id)?.name || x.id,
      rel: x.relation,
    })),
    source,
    actions: [
      { id: "up", label: state.clusterId ? "Back to files" : "Back to architecture" },
      { id: "hops", label: state.hops === 1 ? "Show 2 hops" : "Show 1 hop" },
    ],
  });
}

function renderSheet(view) {
  const el = $("sheet");
  if (!view) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  const rows = (view.rows || [])
    .map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`)
    .join("");
  const flow = (items, dir) =>
    (items || [])
      .map(
        (it) =>
          `<button class="flow ${dir}" data-go="${esc(it.id)}"><b>${esc(it.name)}</b><span>${esc(it.rel)}</span></button>`,
      )
      .join("");
  const spots = (view.hotspots || [])
    .map(
      (it) =>
        `<button class="hot" data-go="${esc(it.id)}"><b>${esc(it.name)}</b><span>${esc(it.rel)}</span></button>`,
    )
    .join("");
  el.innerHTML = `
    <h2>${esc(view.title)}</h2>
    <div class="meta">${esc(view.meta || "")}</div>
    ${rows}
    ${spots ? `<div class="lbl">Coupling hotspots</div>${spots}` : ""}
    ${view.inbound?.length ? `<div class="lbl">Depended on by</div>${flow(view.inbound, "dir-in")}` : ""}
    ${view.outbound?.length ? `<div class="lbl">Depends on</div>${flow(view.outbound, "dir-out")}` : ""}
    ${view.source ? `<div class="lbl">Source</div><pre class="source">${esc(view.source)}</pre>` : ""}
    <div class="actions">${(view.actions || [])
      .map((a) => `<button class="ghost" data-act="${a.id}">${esc(a.label)}</button>`)
      .join("")}</div>
  `;
}

function renderSystems() {
  const el = $("systems");
  const keys = ["", ...state.model.systems.map((s) => s.key)];
  el.innerHTML = keys
    .map((key) => {
      const on = state.systemFilter === key ? " on" : "";
      const label = key || "All";
      return `<button type="button" class="chip${on}" data-sys="${esc(key)}">${esc(label)}</button>`;
    })
    .join("");
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function crumb() {
  if (!state.model) return;
  const parts = [{ id: "arch", label: state.systemFilter || "Architecture" }];
  if (state.clusterId) {
    const c = state.model.clusterById.get(state.clusterId);
    parts.push({ id: "cluster", label: c?.label || "cluster" });
  }
  if (state.focusId) {
    parts.push({ id: "focus", label: state.model.byId.get(state.focusId)?.name || "symbol" });
  }
  $("crumb").innerHTML = parts
    .map((p, i) => {
      const last = i === parts.length - 1;
      return last
        ? `<span class="here">${esc(p.label)}</span>`
        : `<button type="button" data-crumb="${p.id}">${esc(p.label)}</button><span>/</span>`;
    })
    .join("");
}

function controlPoint(a, b, edge) {
  if (state.level === "architecture" && !edge.intra) {
    const ra = state.regions.find((r) => a.x >= r.x && a.x <= r.x + r.w);
    const rb = state.regions.find((r) => b.x >= r.x && b.x <= r.x + r.w);
    if (ra && rb && ra.key !== rb.key) {
      return { x: (ra.cx + rb.cx) / 2, y: Math.min(ra.y, rb.y) - 28 };
    }
  }
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 18 };
}

function draw() {
  const r = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, r.width, r.height);
  ctx.save();
  ctx.translate(state.camera.x, state.camera.y);
  ctx.scale(state.camera.k, state.camera.k);

  const focus = state.hover?.id || state.focusId;
  const live = connectedIds(focus);
  const dimming = Boolean(focus);

  for (const region of state.regions) {
    ctx.beginPath();
    roundRect(ctx, region.x, region.y, region.w, region.h, 18);
    ctx.fillStyle = PALETTE.region;
    ctx.fill();
    ctx.strokeStyle = PALETTE.regionLine;
    ctx.lineWidth = 1 / state.camera.k;
    ctx.stroke();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `${11 / state.camera.k}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(region.label.toUpperCase(), region.x + 18, region.y + 22 / state.camera.k);
    ctx.font = `${10 / state.camera.k}px Inter, system-ui, sans-serif`;
    ctx.fillText(
      `${region.fileCount} files · ${region.clusterCount} clusters`,
      region.x + 18,
      region.y + 38 / state.camera.k,
    );
  }

  const byId = new Map(state.nodes.map((n) => [n.id, n]));
  for (const e of state.edges) {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    const hot = focus && (e.source === focus || e.target === focus);
    if (dimming && !hot) {
      ctx.globalAlpha = 0.1;
    } else {
      ctx.globalAlpha = 1;
    }
    const cpt = controlPoint(a, b, e);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cpt.x, cpt.y, b.x, b.y);
    ctx.strokeStyle = hot ? (e.target === focus ? PALETTE.inbound : PALETTE.accent) : PALETTE.dimEdge;
    ctx.lineWidth = (hot ? 2.4 : Math.min(5, 0.55 + Math.log2(1 + (e.weight || 1)))) / state.camera.k;
    ctx.stroke();
    if (state.level === "focus" && hot) {
      drawArrow(ctx, a, b, cpt, ctx.strokeStyle);
    }
  }
  ctx.globalAlpha = 1;

  const k = state.camera.k;
  const occupied = [];
  const showBudget = () => {
    if (state.level === "architecture") {
      if (k < 0.5) return "region";
      if (k < 0.85) return "hubs";
      return "all";
    }
    if (state.level === "cluster") {
      if (k < 1.2) return "hubs";
      return "all";
    }
    return "all";
  };
  const budget = showBudget();

  for (const n of state.nodes) {
    const active = n.id === focus || n.focus;
    const related = !dimming || live.has(n.id);
      ctx.globalAlpha = related ? 1 : 0.16;
    ctx.beginPath();
    if (n.kind === "cluster") roundRect(ctx, n.x - n.r, n.y - n.r * 0.72, n.r * 2, n.r * 1.44, 9);
    else if (n.kind === "file") ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    else diamond(ctx, n.x, n.y, n.r);
    ctx.fillStyle = PALETTE.node;
    ctx.fill();
    ctx.lineWidth = (active ? 2.6 : n.weight > 80 ? 1.8 : 1.15) / k;
    ctx.strokeStyle = active ? PALETTE.accent : n.dir === "in" ? PALETTE.inbound : PALETTE.stroke;
    if (n.dir === "out") ctx.strokeStyle = active ? PALETTE.accent : PALETTE.accent;
    ctx.stroke();

    const wantLabel =
      active ||
      n.focus ||
      budget === "all" ||
      (budget === "hubs" && (n.hub || n.weight > 40));
    if (wantLabel) {
      const fontPx = 11 / k;
      ctx.font = `${fontPx}px Inter, system-ui, sans-serif`;
      const w = ctx.measureText(n.label).width;
      const lx = n.x - w / 2;
      const ly = n.y + n.r + 6 / k;
      const box = { x: lx - 2, y: ly - fontPx, w: w + 4, h: fontPx + 4 };
      const ok =
        active ||
        n.focus ||
        !occupied.some(
          (o) => !(box.x + box.w < o.x || box.x > o.x + o.w || box.y + box.h < o.y || box.y > o.y + o.h),
        );
      if (ok) {
        occupied.push(box);
        ctx.fillStyle = PALETTE.text;
        ctx.textAlign = "center";
        ctx.fillText(n.label, n.x, n.y + n.r + 14 / k);
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  drawMini(r);
}

function drawArrow(c, a, b, cpt, color) {
  const t = 0.92;
  const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cpt.x + t * t * b.x;
  const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cpt.y + t * t * b.y;
  const dx = 2 * (1 - t) * (cpt.x - a.x) + 2 * t * (b.x - cpt.x);
  const dy = 2 * (1 - t) * (cpt.y - a.y) + 2 * t * (b.y - cpt.y);
  const ang = Math.atan2(dy, dx);
  const s = 7 / state.camera.k;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x - s * Math.cos(ang - 0.45), y - s * Math.sin(ang - 0.45));
  c.lineTo(x - s * Math.cos(ang + 0.45), y - s * Math.sin(ang + 0.45));
  c.closePath();
  c.fillStyle = color;
  c.fill();
}

function drawMini(view) {
  const w = mini.width;
  const h = mini.height;
  mctx.clearRect(0, 0, w, h);
  mctx.fillStyle = "#111113";
  mctx.fillRect(0, 0, w, h);
  const b = boundsOf(state.nodes, state.regions);
  const pad = 16;
  const bw = b.maxX - b.minX || 1;
  const bh = b.maxY - b.minY || 1;
  const k = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  const ox = (w - bw * k) / 2 - b.minX * k;
  const oy = (h - bh * k) / 2 - b.minY * k;
  mctx.save();
  mctx.translate(ox, oy);
  mctx.scale(k, k);
  for (const region of state.regions) {
    mctx.beginPath();
    roundRect(mctx, region.x, region.y, region.w, region.h, 18);
    mctx.fillStyle = "rgba(255,255,255,0.04)";
    mctx.fill();
    mctx.strokeStyle = "#26262b";
    mctx.lineWidth = 1 / k;
    mctx.stroke();
  }
  mctx.fillStyle = "#a1a1aa";
  for (const n of state.nodes) {
    mctx.beginPath();
    mctx.arc(n.x, n.y, Math.max(n.r, 6), 0, Math.PI * 2);
    mctx.fill();
  }
  const vx = (0 - state.camera.x) / state.camera.k;
  const vy = (0 - state.camera.y) / state.camera.k;
  const vw = view.width / state.camera.k;
  const vh = view.height / state.camera.k;
  mctx.strokeStyle = "#a855f7";
  mctx.lineWidth = 1.5 / k;
  mctx.strokeRect(vx, vy, vw, vh);
  mctx.restore();
}

function roundRect(c, x, y, w, h, rad) {
  const r = Math.min(rad, w / 2, h / 2);
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function diamond(c, x, y, r) {
  c.moveTo(x, y - r);
  c.lineTo(x + r, y);
  c.lineTo(x, y + r);
  c.lineTo(x - r, y);
  c.closePath();
}

function tick() {
  const cam = state.camera;
  const t = state.target;
  const k = reduced ? 1 : 0.18;
  cam.x += (t.x - cam.x) * k;
  cam.y += (t.y - cam.y) * k;
  cam.k += (t.k - cam.k) * k;
  if (Math.abs(cam.x - t.x) + Math.abs(cam.y - t.y) + Math.abs(cam.k - t.k) > 0.04) state.dirty = true;
  if (state.dirty) {
    draw();
    crumb();
    state.dirty = false;
  }
  requestAnimationFrame(tick);
}

function goUp() {
  if (state.level === "focus" && state.clusterId) showCluster(state.clusterId);
  else showArchitecture();
}

function activate(id) {
  if (state.model.clusterById.has(id)) {
    showCluster(id);
    return;
  }
  if (state.model.byId.has(id)) {
    showFocus(id);
    return;
  }
}

function moveHover(dx, dy) {
  if (!state.nodes.length) return;
  const cur = state.hover || state.nodes[0];
  let best = null;
  let score = Infinity;
  for (const n of state.nodes) {
    if (n.id === cur.id) continue;
    const vx = n.x - cur.x;
    const vy = n.y - cur.y;
    const dot = vx * dx + vy * dy;
    if (dot <= 4) continue;
    const dist = Math.hypot(vx, vy);
    const s = dist / (0.35 + dot / dist);
    if (s < score) {
      score = s;
      best = n;
    }
  }
  if (best) {
    state.hover = best;
    state.dirty = true;
  }
}

function renderHits() {
  const box = $("hits");
  if (!state.hits.length || !state.query) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = state.hits
    .map(
      (h, i) =>
        `<button class="hit${i === state.hitIndex ? " active" : ""}" data-id="${esc(h.id)}" role="option">
          <span class="k">${esc(h.kind)}</span>
          <span><span class="n">${esc(h.name)}</span><div class="p">${esc(h.path || "")}</div></span>
        </button>`,
    )
    .join("");
}

function emptyState(html) {
  $("empty").hidden = false;
  $("empty").innerHTML = html;
}

function applySystem(key) {
  state.systemFilter = key;
  const url = new URL(location.href);
  if (key) url.searchParams.set("system", key);
  else url.searchParams.delete("system");
  history.replaceState({}, "", url);
  showArchitecture();
}

async function boot() {
  resize();
  const res = await fetch("/api/graph");
  if (!res.ok) {
    emptyState(
      `<div><p>No local graph yet.</p><p>Run <code>npm run graft:build</code> then refresh. $0, no --deep.</p></div>`,
    );
    $("status").textContent = "Graph missing";
    return;
  }
  const wiring = await res.json();
  if (wiring?.error) {
    emptyState(`<div><p>${esc(wiring.error)}</p><p>${esc(wiring.hint || "")}</p></div>`);
    $("status").textContent = "Graph missing";
    return;
  }
  state.model = buildStudioModel(wiring);
  $("status").textContent = `${state.model.meta.fileCount} files · ${state.model.meta.nodeCount} nodes · local`;
  $("hudMeta").innerHTML = `${state.model.clusters.length} clusters<br>${state.model.meta.flowEdges} flow edges<br>${state.model.meta.containsEdges} contains (hidden)`;
  showArchitecture();
}

function setHover(hit, sx, sy) {
  const next = hit?.id || null;
  if (next !== state.hover?.id) {
    state.hover = hit;
    canvas.style.cursor = hit ? "pointer" : "grab";
    state.dirty = true;
  }
  const tip = $("tip");
  if (!hit) {
    tip.hidden = true;
    return;
  }
  const bits = [hit.label];
  if (hit.data?.fileCount) bits.push(`${hit.data.fileCount} files`);
  if (hit.sub && hit.kind !== "cluster") bits.push(hit.sub);
  if (typeof hit.weight === "number" && hit.kind === "cluster") bits.push(`coupling ${hit.weight}`);
  tip.hidden = false;
  tip.textContent = bits.filter(Boolean).join(" · ");
  tip.style.left = `${sx + 14}px`;
  tip.style.top = `${sy + 14}px`;
}

canvas.addEventListener("pointerdown", (ev) => {
  if (ev.button !== 0) return;
  state.moved = false;
  state.drag = {
    x: ev.clientX,
    y: ev.clientY,
    cx: state.target.x,
    cy: state.target.y,
    armed: false,
  };
});
canvas.addEventListener("pointermove", (ev) => {
  if (state.drag) {
    const dx = ev.clientX - state.drag.x;
    const dy = ev.clientY - state.drag.y;
    if (!state.drag.armed && Math.hypot(dx, dy) < 12) return;
    if (!state.drag.armed) {
      state.drag.armed = true;
      state.moved = true;
      canvas.setPointerCapture(ev.pointerId);
      $("tip").hidden = true;
    }
    state.target.x = state.drag.cx + dx;
    state.target.y = state.drag.cy + dy;
    state.dirty = true;
    return;
  }
  const w = worldFromEvent(ev);
  setHover(hitTest(w.x, w.y), w.sx, w.sy);
});
canvas.addEventListener("pointerup", () => {
  state.drag = null;
});
canvas.addEventListener("click", (ev) => {
  if (state.moved) return;
  const w = worldFromEvent(ev);
  const hit = hitTest(w.x, w.y);
  if (hit) activate(hit.id);
});
canvas.addEventListener("pointerleave", () => {
  if (state.drag) return;
  setHover(null, 0, 0);
});
canvas.addEventListener("dblclick", (ev) => {
  const w = worldFromEvent(ev);
  const hit = hitTest(w.x, w.y);
  if (hit?.kind === "cluster") {
    const hub = hit.data?.hubFileId;
    if (hub) activate(hub);
  }
});
canvas.addEventListener(
  "wheel",
  (ev) => {
    ev.preventDefault();
    const w = worldFromEvent(ev);
    const next = Math.max(0.32, Math.min(2.8, state.target.k * Math.exp(-ev.deltaY * 0.0015)));
    const k = next / state.target.k;
    state.target.k = next;
    state.target.x = w.sx - (w.sx - state.target.x) * k;
    state.target.y = w.sy - (w.sy - state.target.y) * k;
    state.dirty = true;
  },
  { passive: false },
);

mini.addEventListener("pointerdown", (ev) => {
  const r = mini.getBoundingClientRect();
  const sx = ((ev.clientX - r.left) / r.width) * mini.width;
  const sy = ((ev.clientY - r.top) / r.height) * mini.height;
  const b = boundsOf(state.nodes, state.regions);
  const pad = 16;
  const bw = b.maxX - b.minX || 1;
  const bh = b.maxY - b.minY || 1;
  const k = Math.min((mini.width - pad * 2) / bw, (mini.height - pad * 2) / bh);
  const ox = (mini.width - bw * k) / 2 - b.minX * k;
  const oy = (mini.height - bh * k) / 2 - b.minY * k;
  const wx = (sx - ox) / k;
  const wy = (sy - oy) / k;
  const view = canvas.getBoundingClientRect();
  state.target.x = view.width / 2 - wx * state.target.k;
  state.target.y = view.height / 2 - wy * state.target.k;
  state.dirty = true;
});

$("search").addEventListener("input", (ev) => {
  state.query = ev.target.value.trim();
  state.hits = searchModel(state.model, state.query, 40, state.systemFilter);
  state.hitIndex = 0;
  renderHits();
});
$("search").addEventListener("keydown", (ev) => {
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    state.hitIndex = Math.min(state.hits.length - 1, state.hitIndex + 1);
    renderHits();
  } else if (ev.key === "ArrowUp") {
    ev.preventDefault();
    state.hitIndex = Math.max(0, state.hitIndex - 1);
    renderHits();
  } else if (ev.key === "Enter" && state.hits[state.hitIndex]) {
    ev.preventDefault();
    activate(state.hits[state.hitIndex].id);
    $("hits").hidden = true;
  } else if (ev.key === "Escape") {
    $("hits").hidden = true;
    $("search").blur();
  }
});
$("hits").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-id]");
  if (btn) {
    activate(btn.dataset.id);
    $("hits").hidden = true;
  }
});
$("crumb").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-crumb]");
  if (!btn) return;
  if (btn.dataset.crumb === "arch") showArchitecture();
  if (btn.dataset.crumb === "cluster" && state.clusterId) showCluster(state.clusterId);
});
$("sheet").addEventListener("click", (ev) => {
  const go = ev.target.closest("[data-go]");
  if (go) {
    activate(go.dataset.go);
    return;
  }
  const act = ev.target.closest("[data-act]");
  if (!act) return;
  if (act.dataset.act === "up") goUp();
  if (act.dataset.act === "hops") {
    state.hops = state.hops === 1 ? 2 : 1;
    if (state.focusId) showFocus(state.focusId);
  }
});
$("systems").addEventListener("click", (ev) => {
  const chip = ev.target.closest("[data-sys]");
  if (chip) applySystem(chip.dataset.sys);
});
$("fitBtn").addEventListener("click", () => {
  const maxK = state.level === "cluster" ? 0.88 : state.level === "focus" ? 1.25 : 1.05;
  fitCamera(state.nodes, state.regions, maxK);
  state.dirty = true;
});
$("helpBtn").addEventListener("click", () => {
  $("help").hidden = !$("help").hidden;
});
$("helpClose").addEventListener("click", () => {
  $("help").hidden = true;
});
$("help").addEventListener("click", (ev) => {
  if (ev.target.id === "help") $("help").hidden = true;
});

window.addEventListener("keydown", (ev) => {
  if (ev.key === "/" && document.activeElement !== $("search")) {
    ev.preventDefault();
    $("search").focus();
  } else if (ev.key === "Escape") {
    if (!$("help").hidden) $("help").hidden = true;
    else if (!$("hits").hidden) $("hits").hidden = true;
    else goUp();
  } else if (ev.key === "Enter" && document.activeElement !== $("search") && state.hover) {
    activate(state.hover.id);
  } else if (ev.key === "?" && document.activeElement !== $("search")) {
    $("help").hidden = !$("help").hidden;
  } else if ((ev.key === "f" || ev.key === "F") && document.activeElement !== $("search")) {
    const maxK = state.level === "cluster" ? 0.88 : state.level === "focus" ? 1.25 : 1.05;
    fitCamera(state.nodes, state.regions, maxK);
    state.dirty = true;
  } else if (ev.key === "ArrowLeft" && document.activeElement !== $("search")) {
    ev.preventDefault();
    moveHover(-1, 0);
  } else if (ev.key === "ArrowRight" && document.activeElement !== $("search")) {
    ev.preventDefault();
    moveHover(1, 0);
  } else if (ev.key === "ArrowUp" && document.activeElement !== $("search")) {
    ev.preventDefault();
    moveHover(0, -1);
  } else if (ev.key === "ArrowDown" && document.activeElement !== $("search")) {
    ev.preventDefault();
    moveHover(0, 1);
  }
});
window.addEventListener("resize", resize);

boot();
tick();
