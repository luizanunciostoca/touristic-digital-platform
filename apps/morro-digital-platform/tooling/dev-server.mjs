import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const defaultDocument = resolve(
  repositoryRoot,
  "apps/morro-digital-platform/public/index.html",
);
const host = process.env.HOST?.trim() || "127.0.0.1";
const port = Number(process.env.PORT || "4173");

const contentTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});

function resolveRequestPath(pathname) {
  if (pathname === "/") return defaultDocument;

  const decoded = decodeURIComponent(pathname);
  const requestedPath = resolve(repositoryRoot, `.${decoded}`);
  const repositoryPrefix = `${repositoryRoot}${sep}`;

  if (!requestedPath.startsWith(repositoryPrefix)) {
    throw new Error("Requested path is outside the repository root.");
  }

  return requestedPath;
}

function applySecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://unpkg.com https://cdnjs.cloudflare.com https://fonts.googleapis.com",
      "img-src 'self' data: https://*.tile.openstreetmap.org",
      "connect-src 'self'",
      "font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
}

const server = createServer(async (request, response) => {
  applySecurityHeaders(response);

  try {
    const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
    const filePath = resolveRequestPath(requestUrl.pathname);
    const fileStat = await stat(filePath);

    if (!fileStat.isFile())
      throw new Error("Requested resource is not a file.");

    response.statusCode = 200;
    response.setHeader(
      "Content-Type",
      contentTypes[extname(filePath)] || "application/octet-stream",
    );
    createReadStream(filePath).pipe(response);
  } catch {
    response.statusCode = 404;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end("Recurso não encontrado.");
  }
});

server.listen(port, host, () => {
  console.log(`Morro Digital disponível em http://${host}:${port}`);
});
