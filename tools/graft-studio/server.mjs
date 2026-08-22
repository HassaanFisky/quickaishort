#!/usr/bin/env node
/**
 * Local-only Studio Graph server.
 * Binds 127.0.0.1. Does not publish graft/. Serves wiring.json to localhost.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "../..");
const publicDir = join(here, "public");
const libDir = join(here, "lib");
const wiringPath = join(repoRoot, "graft/.graph/wiring.json");
const PORT = Number(process.env.GRAFT_STUDIO_PORT || 4400);
const HOST = "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

const SOURCE_EXT = new Set([
  ".py",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".md",
  ".json",
]);

function send(res, status, type, body) {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, "application/json; charset=utf-8", JSON.stringify(obj));
}

function safeRepoFile(rel) {
  const cleaned = normalize(String(rel || "")).replace(/^([/\\])+/, "");
  if (!cleaned || cleaned.split(sep).includes("..")) return null;
  const abs = resolve(repoRoot, cleaned);
  const relBack = relative(repoRoot, abs);
  if (relBack.startsWith("..") || relBack.includes(`..${sep}`)) return null;
  if (cleaned.startsWith(".env") || cleaned.includes(`${sep}.env`)) return null;
  return abs;
}

function serveStatic(res, abs) {
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    send(res, 404, "text/plain; charset=utf-8", "not found");
    return;
  }
  const type = MIME[extname(abs)] || "application/octet-stream";
  send(res, 200, type, readFileSync(abs));
}

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}`);
  const path = url.pathname;

  if (path === "/api/graph") {
    if (!existsSync(wiringPath)) {
      sendJson(res, 404, {
        error: "missing_graph",
        hint: "Run `npm run graft:build` first (local, $0, no --deep).",
      });
      return;
    }
    try {
      const parsed = JSON.parse(readFileSync(wiringPath, "utf8"));
      if (parsed?.meta?.version !== 1) {
        sendJson(res, 409, { error: "unsupported_wiring_version" });
        return;
      }
      sendJson(res, 200, parsed);
    } catch {
      sendJson(res, 500, { error: "unreadable_wiring" });
    }
    return;
  }

  if (path === "/api/source") {
    const abs = safeRepoFile(url.searchParams.get("path"));
    if (!abs) {
      sendJson(res, 400, { error: "bad_path" });
      return;
    }
    if (!SOURCE_EXT.has(extname(abs)) || !existsSync(abs)) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    const start = Math.max(1, Number(url.searchParams.get("start") || 1));
    const end = Math.max(start, Number(url.searchParams.get("end") || start + 24));
    const lines = readFileSync(abs, "utf8").split(/\r?\n/);
    const slice = lines.slice(start - 1, Math.min(end, lines.length));
    sendJson(res, 200, {
      path: relative(repoRoot, abs),
      start,
      end: start + slice.length - 1,
      total: lines.length,
      text: slice.join("\n"),
    });
    return;
  }

  if (path.startsWith("/lib/")) {
    const name = path.slice(5);
    if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
      send(res, 400, "text/plain; charset=utf-8", "bad path");
      return;
    }
    serveStatic(res, join(libDir, name));
    return;
  }

  const rel = path === "/" ? "index.html" : path.replace(/^\/+/, "");
  if (rel.split("/").includes("..")) {
    send(res, 400, "text/plain; charset=utf-8", "bad path");
    return;
  }
  serveStatic(res, join(publicDir, rel));
});

server.listen(PORT, HOST, () => {
  const hasGraph = existsSync(wiringPath);
  process.stdout.write(
    `Studio Graph  http://${HOST}:${PORT}  graph=${hasGraph ? "ready" : "missing — npm run graft:build"}\n`,
  );
});
