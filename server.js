const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 8078);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error("request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function proxyDeepSeek(req, res) {
  try {
    const body = await readBody(req);
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": req.headers.authorization || ""
      },
      body
    });
    const text = await response.text();
    send(res, response.status, text, response.headers.get("content-type") || "application/json; charset=utf-8");
  } catch (error) {
    send(res, 502, JSON.stringify({ error: error.message }), "application/json; charset=utf-8");
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const filePath = path.resolve(root, url.pathname === "/" ? "index.html" : `.${decodeURIComponent(url.pathname)}`);
  if (!filePath.startsWith(root)) {
    send(res, 403, "Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 404, "Not found");
      return;
    }
    send(res, 200, data, mime[path.extname(filePath)] || "application/octet-stream");
  });
}

http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/deepseek/chat/completions") {
    proxyDeepSeek(req, res);
    return;
  }
  serveStatic(req, res);
}).listen(port, "0.0.0.0", () => {
  console.log(`Handwriting AI Canvas: http://localhost:${port}/`);
});
