/**
 * Deterministic layouts for Studio Graph.
 * No live physics. Positions are a function of graph identity + order.
 */

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SYSTEM_ORDER = ["frontend", "fastapi", "extension", "tests"];

export function sortSystems(systems) {
  return systems.slice().sort((a, b) => {
    const ia = SYSTEM_ORDER.indexOf(a.key);
    const ib = SYSTEM_ORDER.indexOf(b.key);
    const sa = ia < 0 ? 100 : ia;
    const sb = ib < 0 ? 100 : ib;
    if (sa !== sb) return sa - sb;
    return a.key.localeCompare(b.key);
  });
}

export function layoutArchitecture(model, systemFilter = "") {
  const systems = sortSystems(
    systemFilter ? model.systems.filter((s) => s.key === systemFilter) : model.systems,
  );
  const colGap = 72;
  const cellW = 100;
  const cellH = 92;
  const padX = 36;
  const padY = 64;
  const prepared = systems.map((sys) => {
    const clusters = model.clusters
      .filter((c) => c.system === sys.key)
      .sort((a, b) => b.importance - a.importance || a.key.localeCompare(b.key));
    const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(Math.max(1, clusters.length)))));
    const rows = Math.max(1, Math.ceil(clusters.length / cols));
    return {
      sys,
      clusters,
      cols,
      rows,
      width: Math.max(280, cols * cellW + padX * 2),
      height: rows * cellH + padY * 2,
    };
  });
  const totalW = prepared.reduce((sum, p) => sum + p.width, 0) + Math.max(0, prepared.length - 1) * colGap;
  let cursor = -totalW / 2;
  const nodes = [];
  const regions = [];

  for (const item of prepared) {
    const { sys, clusters, cols, width, height } = item;
    const originX = cursor;
    const originY = -height / 2;
    regions.push({
      key: sys.key,
      label: sys.label,
      x: originX,
      y: originY,
      w: width,
      h: height,
      cx: originX + width / 2,
      cy: originY + height / 2,
      fileCount: sys.fileCount,
      clusterCount: clusters.length,
      coupling: sys.coupling,
    });
    clusters.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      nodes.push({
        id: c.id,
        kind: "cluster",
        label: c.label,
        sub: `${c.fileCount} files`,
        x: originX + padX + col * cellW + cellW / 2,
        y: originY + padY + row * cellH + cellH / 2,
        r: 13 + Math.min(16, Math.log2(1 + c.fileCount) * 4.2),
        weight: c.coupling,
        hub: i < 3,
        data: c,
      });
    });
    cursor += width + colGap;
  }

  const keep = new Set(nodes.map((n) => n.id));
  const edges = model.clusterEdges
    .filter((e) => keep.has(e.source) && keep.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
      relations: e.relations,
      intra: regionKey(regions, nodes, e.source) === regionKey(regions, nodes, e.target),
    }));

  return { nodes, edges, regions };
}

export function layoutCluster(model, clusterId) {
  const files = filesOf(model, clusterId);
  const n = files.length;
  const nodes = files.map((f, i) => {
    const deg = model.degree(f.id);
    const rad = 22 * Math.sqrt(i + 0.6);
    const ang = i * GOLDEN_ANGLE;
    return {
      id: f.id,
      kind: "file",
      label: f.name,
      sub: f.path,
      x: Math.cos(ang) * rad,
      y: Math.sin(ang) * rad,
      r: 7 + Math.min(13, Math.log2(1 + deg) * 2.8),
      weight: deg,
      hub: i < Math.min(10, Math.ceil(n * 0.18)),
      data: f,
    };
  });
  const hubs = new Set(nodes.filter((node) => node.hub).map((node) => node.id));
  const raw = fileEdgesOf(model, clusterId);
  const edges = simplifyEdges(raw, hubs, n > 40 ? 48 : 80);
  return { nodes, edges, regions: [] };
}

export function layoutNeighborhood(nb, limit = 12) {
  const inbound = capAdj(nb.inbound, limit);
  const outbound = capAdj(nb.outbound, limit);
  const hiddenIn = Math.max(0, nb.inbound.length - inbound.length);
  const hiddenOut = Math.max(0, nb.outbound.length - outbound.length);
  const col = (list, x, dir) => {
    const h = Math.max(1, list.length);
    const gap = list.length > 9 ? 36 : 46;
    return list.map((item, i) => {
      const node = nb.nodes.find((n) => n.id === item.id);
      return {
        id: item.id,
        kind: node?.kind || "symbol",
        label: node?.name || item.id,
        sub: node?.path || "",
        x,
        y: (i - (h - 1) / 2) * gap,
        r: node?.kind === "file" ? 11 : 8,
        data: node,
        relation: item.relation,
        dir,
      };
    });
  };
  const left = col(inbound, -300, "in");
  const right = col(outbound, 300, "out");
  const center = {
    id: nb.center.id,
    kind: nb.center.kind,
    label: nb.center.name,
    sub: `${nb.center.path || ""} ${nb.center.span || ""}`.trim(),
    x: 0,
    y: 0,
    r: 18,
    data: nb.center,
    focus: true,
    hub: true,
  };
  const shown = new Set([center.id, ...left.map((n) => n.id), ...right.map((n) => n.id)]);
  const edges = nb.edges
    .filter((e) => shown.has(e.source) && shown.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      relation: e.relation,
      weight: 1,
    }));
  return {
    nodes: [...left, center, ...right],
    edges,
    regions: [],
    hiddenIn,
    hiddenOut,
  };
}

export function capAdj(list, limit) {
  return list
    .slice()
    .sort((a, b) => (b.count || 0) - (a.count || 0) || String(a.id).localeCompare(String(b.id)))
    .slice(0, limit);
}

export function simplifyEdges(edges, hubs, maxEdges) {
  const ranked = edges.slice().sort((a, b) => (b.weight || 0) - (a.weight || 0));
  const kept = [];
  const seen = new Set();
  for (const e of ranked) {
    const k = `${e.source}\0${e.target}\0${e.relation || ""}`;
    if (seen.has(k)) continue;
    const hubby = hubs.has(e.source) || hubs.has(e.target);
    if (!hubby && kept.length >= maxEdges) continue;
    if (kept.length >= maxEdges * 2) break;
    seen.add(k);
    kept.push({
      source: e.source,
      target: e.target,
      weight: e.weight,
      relation: e.relation,
    });
  }
  return kept;
}

function filesOf(model, clusterId) {
  const cluster = model.clusterById.get(clusterId);
  if (!cluster) return [];
  return cluster.fileIds
    .map((id) => model.byId.get(id))
    .filter(Boolean)
    .sort((a, b) => model.degree(b.id) - model.degree(a.id) || a.name.localeCompare(b.name));
}

function fileEdgesOf(model, clusterId) {
  const cluster = model.clusterById.get(clusterId);
  if (!cluster) return [];
  const set = new Set(cluster.fileIds);
  return model.fileEdges.filter((e) => set.has(e.source) && set.has(e.target));
}

function regionKey(regions, nodes, id) {
  const node = nodes.find((n) => n.id === id);
  if (!node) return "";
  const hit = regions.find(
    (r) => node.x >= r.x && node.x <= r.x + r.w && node.y >= r.y && node.y <= r.y + r.h,
  );
  return hit?.key || "";
}
