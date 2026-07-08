const http = require("http");
const fs = require("fs");
const path = require("path");

// ── 加载 .env ──
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv(path.join(__dirname, ".env"));

const root = __dirname;
const port = Number(process.env.PORT || 8078);

// ── 服务商定义 ──
// 每个服务商只需 API Key 和接入点地址，模型名有默认值
const PROVIDER_DEFAULTS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    chatModel: "gpt-4.1",
    ocrModel: "gpt-4o",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    chatModel: "deepseek-v4-pro",
    ocrModel: "deepseek-v4-pro",
  },
  doubao: {
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    chatModel: "doubao-pro-32k",
    ocrModel: "doubao-pro-32k",
  },
};

function buildProvider(name) {
  const def = PROVIDER_DEFAULTS[name];
  if (!def) return null;
  const prefix = name.toUpperCase();
  const key = process.env[`${prefix}_API_KEY`] || "";
  if (!key) return null;
  const baseUrl = process.env[`${prefix}_BASE_URL`] || def.baseUrl;
  return {
    key,
    chatEndpoint: baseUrl.replace(/\/+$/, "") + "/chat/completions",
    chatModel: process.env[`${prefix}_CHAT_MODEL`] || def.chatModel,
    ocrEndpoint: baseUrl.replace(/\/+$/, "") + "/chat/completions",
    ocrModel: process.env[`${prefix}_OCR_MODEL`] || def.ocrModel,
  };
}

// 尝试顺序：环境变量指定 → 第一个可用的
function resolveProvider(preferred) {
  if (preferred) {
    const p = buildProvider(preferred);
    if (p) return { name: preferred, ...p };
  }
  for (const name of Object.keys(PROVIDER_DEFAULTS)) {
    const p = buildProvider(name);
    if (p) return { name, ...p };
  }
  return null;
}

function getTextProvider() {
  return resolveProvider(process.env.DEFAULT_TEXT_PROVIDER || "");
}

function getOcrProvider() {
  return resolveProvider(process.env.DEFAULT_OCR_PROVIDER || "");
}

// ── MIME ──
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
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
      if (data.length > 12_000_000) {
        reject(new Error("request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// ── /api/chat — Agent 文本生成 ──
async function handleChat(req, res) {
  try {
    const provider = getTextProvider();
    if (!provider) {
      send(res, 503, JSON.stringify({
        error: "未配置任何 AI 服务商。请在 .env 中设置 OPENAI_API_KEY / DEEPSEEK_API_KEY / DOUBAO_API_KEY"
      }), "application/json; charset=utf-8");
      return;
    }
    const raw = await readBody(req);
    const { messages } = JSON.parse(raw);
    const response = await fetch(provider.chatEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${provider.key}`
      },
      body: JSON.stringify({ model: provider.chatModel, messages })
    });
    const text = await response.text();
    send(res, response.status, text,
      response.headers.get("content-type") || "application/json; charset=utf-8");
  } catch (error) {
    send(res, 502, JSON.stringify({ error: error.message }),
      "application/json; charset=utf-8");
  }
}

// ── /api/ocr — 手写图片识别 ──
async function handleOcr(req, res) {
  try {
    const provider = getOcrProvider();
    if (!provider) {
      send(res, 503, JSON.stringify({
        error: "未配置 OCR 服务商。请在 .env 中设置 API Key"
      }), "application/json; charset=utf-8");
      return;
    }
    const raw = await readBody(req);
    const { imageDataUrl } = JSON.parse(raw);
    const response = await fetch(provider.ocrEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${provider.key}`
      },
      body: JSON.stringify({
        model: provider.ocrModel,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "请识别这张图片中的手写中文或英文文字。只返回识别出的文字内容，不要添加任何解释、问候或额外文字。如果无法识别，返回空字符串。" },
            { type: "image_url", image_url: { url: imageDataUrl } }
          ]
        }]
      })
    });
    const text = await response.text();
    send(res, response.status, text,
      response.headers.get("content-type") || "application/json; charset=utf-8");
  } catch (error) {
    send(res, 502, JSON.stringify({ error: error.message }),
      "application/json; charset=utf-8");
  }
}

// ── /api/health — 健康检查 ──
function handleHealth(req, res) {
  const text = getTextProvider();
  const ocr = getOcrProvider();
  const configured = Object.keys(PROVIDER_DEFAULTS)
    .filter(name => !!process.env[`${name.toUpperCase()}_API_KEY`]);

  send(res, 200, JSON.stringify({
    status: text ? "ok" : "no_key",
    textProvider: text ? text.name : null,
    ocrProvider: ocr ? ocr.name : null,
    configured,
    demo: !text
  }), "application/json; charset=utf-8");
}

// ── 静态文件 ──
function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const filePath = path.resolve(root,
    url.pathname === "/" ? "index.html" : `.${decodeURIComponent(url.pathname)}`);
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

// ── 路由 ──
http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") return handleChat(req, res);
  if (req.method === "POST" && req.url === "/api/ocr") return handleOcr(req, res);
  if (req.method === "GET" && req.url === "/api/health") return handleHealth(req, res);
  serveStatic(req, res);
}).listen(port, "0.0.0.0", () => {
  const text = getTextProvider();
  console.log(`InkScope: http://localhost:${port}/`);
  console.log(`  文本服务: ${text ? text.name + " (" + text.chatModel + ")" : "未配置"}`);
  const ocr = getOcrProvider();
  console.log(`  OCR 服务: ${ocr ? ocr.name + " (" + ocr.ocrModel + ")" : "未配置"}`);
  if (!text) {
    console.log("  提示: 复制 .env.example 为 .env 并填入 API Key");
  }
});
