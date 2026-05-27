import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.join(process.cwd(), "public");
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  let filePath = path.join(root, decodeURIComponent(url.pathname));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    filePath = path.join(root, "404.html");
  }

  try {
    const data = await fs.readFile(filePath);
    response.writeHead(filePath.endsWith("404.html") ? 404 : 200, {
      "content-type": types[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(data);
  } catch {
    response.writeHead(500);
    response.end("Server error");
  }
});

server.listen(port, () => {
  console.log(`Preview: http://localhost:${port}`);
});
