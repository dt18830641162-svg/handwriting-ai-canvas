const http = require("http");
const fs = require("fs");
const path = require("path");

// ── 加载 .env ──
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log("[InkScope] .env 文件未找到:", filePath);
    return;
  }
  const content = fs.readFileSync(filePath, "utf-8");
  // 处理可能的 UTF-8 BOM
  const clean = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
  const lines = clean.split(/\r?\n/);
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    // 只在环境变量未设置时才从 .env 加载（不覆盖系统环境变量）
    if (!process.env[key]) {
      process.env[key] = val;
      count++;
    }
  }
  console.log(`[InkScope] 已从 .env 加载 ${count} 个环境变量`);
}
loadEnv(path.join(__dirname, ".env"));

// ── 启动前检查必需的环境变量 ──
const MISSING_VARS = [];
if (!process.env.DOUBAO_API_KEY) MISSING_VARS.push("DOUBAO_API_KEY");
if (!process.env.DOUBAO_CHAT_MODEL) MISSING_VARS.push("DOUBAO_CHAT_MODEL");

if (MISSING_VARS.length > 0) {
  console.log("[InkScope] ⚠ 缺少以下环境变量：");
  MISSING_VARS.forEach(v => console.log(`  - ${v}`));
  console.log("  请在 .env 文件中配置，或复制 .env.example 为 .env 后填入值。");
  console.log("  服务将以模拟模式运行（不调用真实 AI）。");
  console.log("");
}

const root = __dirname;
const port = Number(process.env.PORT || 8078);

// 运行时配置（由前端 /api/config 设置，优先级高于 .env）
let runtimeConfig = {
  apiKey: "",
  endpoint: "",  // 接入点名称，用作 model
};

function getProvider() {
  // 优先使用运行时配置（开发者模式）
  if (runtimeConfig.apiKey && runtimeConfig.endpoint) {
    return {
      name: "doubao",
      key: runtimeConfig.apiKey,
      chatEndpoint: (process.env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3") + "/chat/completions",
      chatModel: runtimeConfig.endpoint,
      ocrEndpoint: (process.env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3") + "/chat/completions",
      ocrModel: runtimeConfig.endpoint,
    };
  }
  // 从 .env 读取配置
  const envKey = process.env.DOUBAO_API_KEY || "";
  const chatModel = process.env.DOUBAO_CHAT_MODEL || "";
  const ocrModel = process.env.DOUBAO_OCR_MODEL || chatModel;
  if (envKey && chatModel) {
    const baseUrl = process.env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
    return {
      name: "doubao",
      key: envKey,
      chatEndpoint: baseUrl + "/chat/completions",
      chatModel: chatModel,
      ocrEndpoint: baseUrl + "/chat/completions",
      ocrModel: ocrModel,
    };
  }
  return null;
}

function getTextProvider() {
  return getProvider();
}

function getOcrProvider() {
  return getProvider();
}

// ── MIME ──
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
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

// ── /api/config — 运行时设置 API 配置 ──
async function handleConfig(req, res) {
  try {
    const raw = await readBody(req);
    const { apiKey, endpoint } = JSON.parse(raw);
    if (apiKey) runtimeConfig.apiKey = apiKey;
    if (endpoint) runtimeConfig.endpoint = endpoint;
    send(res, 200, JSON.stringify({ ok: true }), "application/json; charset=utf-8");
  } catch (error) {
    send(res, 400, JSON.stringify({ error: error.message }), "application/json; charset=utf-8");
  }
}

// ── /api/health — 健康检查 ──
function handleHealth(req, res) {
  const provider = getProvider();
  const configured = !!(runtimeConfig.apiKey || process.env.DOUBAO_API_KEY);

  send(res, 200, JSON.stringify({
    status: provider ? "ok" : "no_key",
    textProvider: provider ? "doubao" : null,
    ocrProvider: provider ? "doubao" : null,
    configured: configured ? ["doubao"] : [],
    demo: !provider,
    devSettingsEnabled: process.env.ENABLE_DEV_SETTINGS === "true"
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
const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") return handleChat(req, res);
  if (req.method === "POST" && req.url === "/api/ocr") return handleOcr(req, res);
  if (req.method === "POST" && req.url === "/api/config") return handleConfig(req, res);
  if (req.method === "GET" && req.url === "/api/health") return handleHealth(req, res);
  serveStatic(req, res);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`[InkScope] ✕ 端口 ${port} 已被占用，请先执行：`);
    console.log("  taskkill /F /IM node.exe");
    console.log("  然后重新运行 node server.js");
    process.exit(1);
  }
  throw err;
});

server.listen(port, "0.0.0.0", () => {
  const provider = getProvider();
  console.log(`[InkScope] 服务已启动: http://localhost:${port}/`);
  if (provider) {
    console.log(`  豆包 API: 已连接 · 模型 ${provider.chatModel}`);
  } else {
    console.log("  豆包 API: 未配置（模拟模式）");
    if (MISSING_VARS.length > 0) {
      console.log(`  缺失变量: ${MISSING_VARS.join(", ")}`);
    }
  }
});
