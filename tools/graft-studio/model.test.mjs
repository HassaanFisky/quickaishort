import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildStudioModel,
  clusterKey,
  neighborhood,
  blastRadius,
  searchModel,
  hotspots,
} from "./lib/model.mjs";
import { layoutArchitecture, layoutCluster, layoutNeighborhood, capAdj } from "./lib/layout.mjs";

const wiring = {
  meta: { version: 1, languages: ["python"] },
  nodes: [
    { id: "pkg/a.py", name: "a.py", kind: "file", path: "pkg/a.py", span: "L1-L10" },
    { id: "pkg/b.py", name: "b.py", kind: "file", path: "pkg/b.py", span: "L1-L8" },
    { id: "pkg/a.py#foo", name: "foo", kind: "function", path: "pkg/a.py", span: "L2-L4" },
    { id: "pkg/b.py#bar", name: "bar", kind: "function", path: "pkg/b.py", span: "L3-L5" },
    { id: "other/c.py", name: "c.py", kind: "file", path: "other/c.py", span: "L1-L2" },
  ],
  edges: [
    { source: "pkg/a.py", target: "pkg/a.py#foo", relation: "contains", confidence: "extracted" },
    { source: "pkg/a.py#foo", target: "pkg/b.py#bar", relation: "calls", confidence: "extracted" },
    { source: "pkg/b.py#bar", target: "other/c.py", relation: "imports", confidence: "extracted" },
  ],
};

test("clusterKey uses system/subsystem, not filename", () => {
  assert.equal(clusterKey("fastapi/services/decision_service.py"), "fastapi/services");
  assert.equal(clusterKey("frontend/src/lib/api.ts"), "frontend/src/lib");
  assert.equal(clusterKey("fastapi/main.py"), "fastapi");
  assert.equal(clusterKey("extension/background.js"), "extension");
});

test("model never invents flow edges and skips contains", () => {
  const m = buildStudioModel(wiring);
  assert.equal(m.meta.nodeCount, 5);
  assert.equal(m.meta.containsEdges, 1);
  assert.equal(m.meta.flowEdges, 2);
  assert.equal(m.fileEdges.length, 2);
  const pairs = m.fileEdges.map((e) => `${e.source}->${e.target}:${e.relation}`).sort();
  assert.deepEqual(pairs, ["pkg/a.py->pkg/b.py:calls", "pkg/b.py->other/c.py:imports"]);
});

test("cluster aggregation only counts existing cross-file flow", () => {
  const m = buildStudioModel(wiring);
  assert.equal(m.clusters.length, 2);
  assert.equal(m.clusterEdges.length, 1);
  assert.equal(m.clusterEdges[0].weight, 1);
  assert.equal(m.clusterEdges[0].source.startsWith("cluster:"), true);
});

test("neighborhood is truthful 1-hop", () => {
  const m = buildStudioModel(wiring);
  const n = neighborhood(m, "pkg/a.py#foo", 1);
  assert.equal(n.outbound.some((x) => x.id === "pkg/b.py#bar"), true);
  assert.equal(n.inbound.length, 0);
  assert.equal(
    n.edges.every((e) => e.source === "pkg/a.py#foo" || e.target === "pkg/a.py#foo"),
    true,
  );
});

test("blast radius stays at file level and uses real file edges", () => {
  const m = buildStudioModel(wiring);
  const b = blastRadius(m, "pkg/a.py#foo");
  assert.equal(b.fileId, "pkg/a.py");
  assert.equal(b.outbound[0].id, "pkg/b.py");
  assert.equal(b.inbound.length, 0);
});

test("search ranks exact name above path substring", () => {
  const m = buildStudioModel(wiring);
  const hits = searchModel(m, "foo");
  assert.equal(hits[0].id, "pkg/a.py#foo");
});

test("search includes clusters and can filter by system", () => {
  const m = buildStudioModel(wiring);
  const hits = searchModel(m, "pkg");
  assert.equal(hits.some((h) => h.kind === "cluster" && h.id.startsWith("cluster:")), true);
  const filtered = searchModel(m, "bar", 40, "other");
  assert.equal(filtered.some((h) => h.id === "pkg/b.py#bar"), false);
});

test("architecture layout is deterministic and one node per cluster", () => {
  const m = buildStudioModel(wiring);
  const a = layoutArchitecture(m);
  const b = layoutArchitecture(m);
  assert.equal(a.nodes.length, m.clusters.length);
  assert.deepEqual(
    a.nodes.map((n) => [n.id, n.x, n.y]),
    b.nodes.map((n) => [n.id, n.x, n.y]),
  );
  assert.equal(a.regions.length, m.systems.length);
});

test("cluster sunflower keeps unique positions and does not invent edges", () => {
  const m = buildStudioModel(wiring);
  const clusterId = m.fileToCluster.get("pkg/a.py");
  const g = layoutCluster(m, clusterId);
  const keys = new Set(g.nodes.map((n) => `${n.x},${n.y}`));
  assert.equal(keys.size, g.nodes.length);
  for (const e of g.edges) {
    assert.equal(m.fileEdges.some((fe) => fe.source === e.source && fe.target === e.target), true);
  }
});

test("neighborhood layout caps columns without inventing neighbors", () => {
  const inbound = Array.from({ length: 20 }, (_, i) => ({ id: `in${i}`, relation: "calls", count: 20 - i }));
  const g = layoutNeighborhood(
    {
      center: { id: "c", name: "c", kind: "file", path: "c.py" },
      inbound,
      outbound: [{ id: "out0", relation: "imports", count: 1 }],
      nodes: [
        { id: "c", name: "c", kind: "file" },
        ...inbound.map((x) => ({ id: x.id, name: x.id, kind: "function" })),
        { id: "out0", name: "out0", kind: "function" },
      ],
      edges: inbound.map((x) => ({ source: x.id, target: "c", relation: "calls" })),
    },
    12,
  );
  assert.equal(g.hiddenIn, 8);
  assert.equal(g.nodes.filter((n) => n.dir === "in").length, 12);
  assert.equal(capAdj(inbound, 12).length, 12);
});

test("hotspots are real coupling, not visual invention", () => {
  const m = buildStudioModel(wiring);
  const spots = hotspots(m, 3);
  assert.equal(spots.length > 0, true);
  assert.equal(spots[0].coupling > 0, true);
});
