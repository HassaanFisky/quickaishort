/**
 * Studio Graph model — deterministic architecture over Graft wiring.json.
 * Never invents edges. Aggregates only existing calls/imports/extends/references.
 */

const REL_FLOW = new Set(["calls", "imports", "extends", "references"]);
const REL_CONTAINS = "contains";

export function buildStudioModel(wiring) {
  const nodes = Array.isArray(wiring?.nodes) ? wiring.nodes : [];
  const edges = Array.isArray(wiring?.edges) ? wiring.edges : [];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const files = nodes.filter((n) => n.kind === "file");
  const symbols = nodes.filter((n) => n.kind !== "file");

  const fileOf = new Map();
  for (const n of nodes) {
    fileOf.set(n.id, n.kind === "file" ? n.id : fileIdFromSymbol(n));
  }

  const adjOut = new Map();
  const adjIn = new Map();
  const fileEdgeW = new Map();
  let flowEdges = 0;
  let containsEdges = 0;

  const pushAdj = (map, from, to, relation) => {
    if (!map.has(from)) map.set(from, []);
    map.get(from).push({ id: to, relation });
  };

  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    if (e.relation === REL_CONTAINS) {
      containsEdges += 1;
      continue;
    }
    if (!REL_FLOW.has(e.relation)) continue;
    flowEdges += 1;
    pushAdj(adjOut, e.source, e.target, e.relation);
    pushAdj(adjIn, e.target, e.source, e.relation);

    const fs = fileOf.get(e.source);
    const ft = fileOf.get(e.target);
    if (!fs || !ft || fs === ft) continue;
    const key = `${fs}\0${ft}\0${e.relation}`;
    fileEdgeW.set(key, (fileEdgeW.get(key) || 0) + 1);
  }

  const fileEdges = [];
  for (const [key, weight] of fileEdgeW) {
    const [source, target, relation] = key.split("\0");
    fileEdges.push({ source, target, relation, weight });
    pushAdj(adjOut, source, target, relation);
    pushAdj(adjIn, target, source, relation);
  }

  const degree = (id) => (adjOut.get(id)?.length || 0) + (adjIn.get(id)?.length || 0);

  const clusters = new Map();
  for (const file of files) {
    const key = clusterKey(file.path || file.id);
    if (!clusters.has(key)) {
      clusters.set(key, {
        id: `cluster:${key}`,
        key,
        label: clusterLabel(key),
        system: systemOf(key),
        fileIds: [],
        symbolCount: 0,
        inWeight: 0,
        outWeight: 0,
      });
    }
    const c = clusters.get(key);
    c.fileIds.push(file.id);
  }

  for (const s of symbols) {
    const fid = fileOf.get(s.id);
    const file = byId.get(fid);
    const key = clusterKey(file?.path || fid || "");
    const c = clusters.get(key);
    if (c) c.symbolCount += 1;
  }

  const fileToCluster = new Map();
  for (const c of clusters.values()) {
    for (const fid of c.fileIds) fileToCluster.set(fid, c.id);
  }

  const clusterEdgeW = new Map();
  for (const fe of fileEdges) {
    const cs = fileToCluster.get(fe.source);
    const ct = fileToCluster.get(fe.target);
    if (!cs || !ct || cs === ct) continue;
    const key = `${cs}\0${ct}`;
    const prev = clusterEdgeW.get(key) || { weight: 0, relations: {} };
    prev.weight += fe.weight;
    prev.relations[fe.relation] = (prev.relations[fe.relation] || 0) + fe.weight;
    clusterEdgeW.set(key, prev);
    const src = [...clusters.values()].find((c) => c.id === cs);
    const dst = [...clusters.values()].find((c) => c.id === ct);
    if (src) src.outWeight += fe.weight;
    if (dst) dst.inWeight += fe.weight;
  }

  const clusterList = [...clusters.values()].map((c) => {
    const ext = c.inWeight + c.outWeight;
    c.fileCount = c.fileIds.length;
    c.hubFileId = hubFile(c.fileIds, degree);
    c.coupling = ext;
    c.importance = c.fileCount + Math.log2(1 + ext) * 4 + Math.log2(1 + c.symbolCount);
    return c;
  });

  const clusterEdges = [];
  for (const [key, agg] of clusterEdgeW) {
    const [source, target] = key.split("\0");
    clusterEdges.push({ source, target, weight: agg.weight, relations: agg.relations });
  }

  const systems = new Map();
  for (const c of clusterList) {
    if (!systems.has(c.system)) {
      systems.set(c.system, {
        id: `system:${c.system}`,
        key: c.system,
        label: c.system || "(root)",
        clusterIds: [],
        fileCount: 0,
        coupling: 0,
      });
    }
    const s = systems.get(c.system);
    s.clusterIds.push(c.id);
    s.fileCount += c.fileCount;
    s.coupling += c.coupling;
  }

  return {
    meta: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      fileCount: files.length,
      symbolCount: symbols.length,
      flowEdges,
      containsEdges,
      clusterCount: clusterList.length,
      languages: wiring?.meta?.languages || [],
    },
    byId,
    files,
    symbols,
    fileOf,
    fileToCluster,
    clusters: clusterList,
    clusterById: new Map(clusterList.map((c) => [c.id, c])),
    clusterEdges,
    fileEdges,
    systems: [...systems.values()],
    adjOut,
    adjIn,
    degree,
  };
}

export function clusterKey(path) {
  const parts = String(path || "")
    .split("/")
    .filter(Boolean);
  if (parts.length === 0) return "(root)";
  const dir = looksLikeFile(parts[parts.length - 1]) ? parts.slice(0, -1) : parts;
  if (dir.length === 0) return parts[0];
  const root = dir[0];
  if (root === "frontend" && dir[1] === "src" && dir[2]) {
    return `frontend/src/${dir[2]}`;
  }
  if (dir.length >= 2) return `${dir[0]}/${dir[1]}`;
  return root;
}

function looksLikeFile(seg) {
  return /\.[a-z0-9]+$/i.test(seg);
}

export function systemOf(key) {
  return String(key).split("/")[0] || "(root)";
}

export function clusterLabel(key) {
  const parts = String(key).split("/");
  return parts[parts.length - 1] || key;
}

export function searchModel(model, query, limit = 40, systemFilter = "") {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return [];
  const allowCluster = systemFilter
    ? new Set(model.clusters.filter((c) => c.system === systemFilter).map((c) => c.id))
    : null;
  const allowFile = (fileId) => {
    if (!allowCluster) return true;
    const cid = model.fileToCluster.get(fileId);
    return allowCluster.has(cid);
  };
  const scored = [];
  for (const c of model.clusters) {
    if (allowCluster && !allowCluster.has(c.id)) continue;
    const name = (c.label || "").toLowerCase();
    const path = (c.key || "").toLowerCase();
    let score = 0;
    if (name === q || path === q) score = 110;
    else if (name.startsWith(q) || path.startsWith(q)) score = 90;
    else if (name.includes(q) || path.includes(q)) score = 70;
    else continue;
    score += Math.min(10, Math.log2(1 + c.fileCount) * 2);
    scored.push({
      id: c.id,
      name: c.label,
      kind: "cluster",
      path: c.key,
      span: "",
      score,
    });
  }
  for (const n of model.byId.values()) {
    const fileId = n.kind === "file" ? n.id : model.fileOf.get(n.id);
    if (!allowFile(fileId)) continue;
    const name = (n.name || "").toLowerCase();
    const path = (n.path || n.id || "").toLowerCase();
    const id = (n.id || "").toLowerCase();
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (path.includes(q) || id.includes(q)) score = 40;
    else continue;
    score += Math.min(12, model.degree(n.id));
    scored.push({
      id: n.id,
      name: n.name,
      kind: n.kind,
      path: n.path,
      span: n.span,
      score,
    });
  }
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored.slice(0, limit);
}

export function hotspots(model, limit = 6) {
  return model.clusters
    .slice()
    .sort((a, b) => b.coupling - a.coupling || b.fileCount - a.fileCount)
    .filter((c) => c.coupling > 0)
    .slice(0, limit);
}

export function neighborhood(model, id, hops = 1) {
  const center = model.byId.get(id);
  if (!center) return null;
  const inbound = uniqueAdj(model.adjIn.get(id) || []);
  const outbound = uniqueAdj(model.adjOut.get(id) || []);
  const nodes = new Map([[id, center]]);
  const edges = [];
  const walk = (startIds, dir, depth) => {
    let frontier = startIds;
    for (let h = 0; h < depth; h += 1) {
      const next = [];
      for (const sid of frontier) {
        const list = dir === "in" ? model.adjIn.get(sid) || [] : model.adjOut.get(sid) || [];
        for (const rel of list) {
          const node = model.byId.get(rel.id);
          if (!node) continue;
          if (!nodes.has(rel.id)) {
            nodes.set(rel.id, node);
            next.push(rel.id);
          }
          const a = dir === "out" ? sid : rel.id;
          const b = dir === "out" ? rel.id : sid;
          edges.push({ source: a, target: b, relation: rel.relation });
        }
      }
      frontier = next;
    }
  };
  walk([id], "in", hops);
  walk([id], "out", hops);
  return {
    center,
    inbound,
    outbound,
    nodes: [...nodes.values()],
    edges: dedupeEdges(edges),
  };
}

export function blastRadius(model, id) {
  const fileId = model.fileOf.get(id) || id;
  const inboundFiles = new Map();
  const outboundFiles = new Map();
  for (const fe of model.fileEdges) {
    if (fe.target === fileId) {
      inboundFiles.set(fe.source, (inboundFiles.get(fe.source) || 0) + fe.weight);
    }
    if (fe.source === fileId) {
      outboundFiles.set(fe.target, (outboundFiles.get(fe.target) || 0) + fe.weight);
    }
  }
  return {
    fileId,
    inbound: [...inboundFiles.entries()]
      .map(([fid, weight]) => ({ id: fid, weight, node: model.byId.get(fid) }))
      .sort((a, b) => b.weight - a.weight),
    outbound: [...outboundFiles.entries()]
      .map(([fid, weight]) => ({ id: fid, weight, node: model.byId.get(fid) }))
      .sort((a, b) => b.weight - a.weight),
  };
}

export function filesInCluster(model, clusterId) {
  const cluster = model.clusterById.get(clusterId);
  if (!cluster) return [];
  return cluster.fileIds
    .map((id) => model.byId.get(id))
    .filter(Boolean)
    .sort((a, b) => model.degree(b.id) - model.degree(a.id) || a.name.localeCompare(b.name));
}

export function fileEdgesInCluster(model, clusterId) {
  const cluster = model.clusterById.get(clusterId);
  if (!cluster) return [];
  const set = new Set(cluster.fileIds);
  return model.fileEdges.filter((e) => set.has(e.source) && set.has(e.target));
}

export function parseSpan(span) {
  const m = String(span || "").match(/L(\d+)(?:-L(\d+))?/);
  if (!m) return { start: 1, end: 1 };
  return { start: Number(m[1]), end: Number(m[2] || m[1]) };
}

function fileIdFromSymbol(n) {
  const id = n.id || "";
  const hash = id.indexOf("#");
  if (hash > 0) return id.slice(0, hash);
  return n.path || id;
}

function hubFile(fileIds, degree) {
  let best = fileIds[0];
  let score = -1;
  for (const id of fileIds) {
    const d = degree(id);
    if (d > score) {
      score = d;
      best = id;
    }
  }
  return best;
}

function uniqueAdj(list) {
  const seen = new Map();
  for (const rel of list) {
    const prev = seen.get(rel.id);
    if (!prev) seen.set(rel.id, { id: rel.id, relation: rel.relation, count: 1 });
    else prev.count += 1;
  }
  return [...seen.values()];
}

function dedupeEdges(edges) {
  const seen = new Set();
  const out = [];
  for (const e of edges) {
    const k = `${e.source}\0${e.target}\0${e.relation}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}
