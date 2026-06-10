// Zero-dependency static server for local development.
// Serves the repository root so the app can fetch the fixture snapshot.
//
//   node apps/web/serve.mjs            -> http://localhost:8080/apps/web/
//   node apps/web/serve.mjs 3000       -> custom port
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const PORT = Number(process.argv[2] ?? 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".md": "text/plain; charset=utf-8",
};

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  let filePath = normalize(join(REPO_ROOT, urlPath));
  if (!filePath.startsWith(REPO_ROOT + sep) && filePath !== REPO_ROOT) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }
  if (!existsSync(filePath)) {
    res.writeHead(404).end("Not found: " + urlPath);
    return;
  }
  res.writeHead(200, {
    "content-type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Gemelo Digital Rosario — dev server`);
  console.log(`  serving ${REPO_ROOT}`);
  console.log(`  open    http://localhost:${PORT}/apps/web/`);
});
