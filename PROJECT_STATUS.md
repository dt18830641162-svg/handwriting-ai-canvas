# PROJECT_STATUS.md

## 当前项目状态

这是 Codex 生成 + Claude Code 持续开发的手写交互式 AI Canvas 网页项目。

## 当前启动方式

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env，至少填入一个服务商的 API Key

# 2. 启动
node server.js
```

访问：http://localhost:8078

## 已有文件

- index.html — 页面结构
- styles.css — 页面样式
- app.js — 交互逻辑
- server.js — 本地服务 + AI 代理
- .env.example — 环境变量模板
- .gitignore — Git 忽略规则

## API 架构（生产部署模式）

```
前端 (app.js)          后端 (server.js)         AI 服务商
───────────           ─────────────────       ──────────
callModel()     →     POST /api/chat     →   OpenAI / DeepSeek / 豆包
ocrFromImage()  →     POST /api/ocr      →   Vision 模型
checkHealth()   →     GET  /api/health   →   返回服务状态
```

所有 API Key 在后端 .env 中管理，前端不暴露任何 Key。

## 环境变量

| 变量 | 说明 | 必填 |
|---|---|---|
| `DOUBAO_API_KEY` | 豆包 API Key | 至少一个 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | 至少一个 |
| `OPENAI_API_KEY` | OpenAI API Key | 至少一个 |
| `DEFAULT_TEXT_PROVIDER` | 文本生成服务商 (doubao/deepseek/openai) | 可选 |
| `DEFAULT_OCR_PROVIDER` | OCR 服务商 | 可选 |
| `PORT` | 服务端口 (默认 8078) | 可选 |

## 下一步任务

1. Agent 角色自定义（用户可添加/编辑/删除 Agent）
2. Content 内容管理栏（左侧内容列表）
3. iPad 端触摸和 Apple Pencil 体验优化
4. 节点上下文管理可视化增强

## 最近一次修改记录

---

### 工具：
Claude Code

### 完成内容：

**生产部署改造（第 2 轮）：**
1. **后端 API 代理**：server.js 重写，新增 `/api/chat`（文本生成）、`/api/ocr`（手写识别）、`/api/health`（健康检查）三个端点。
2. **多服务商支持**：支持 OpenAI、DeepSeek、豆包 (Doubao) 三种 AI 服务商，通过 `.env` 环境变量切换。每个服务商只需配置 `{NAME}_API_KEY`，可选配置 `{NAME}_BASE_URL`。
3. **前端安全加固**：移除设置面板中所有 API 配置字段（供应商、地址、模型、协议、Key）。前端不再持有任何 API Key，所有 AI 请求通过 server.js 代理。
4. **设置面板精简**：仅保留 4 个用户开关（OCR 修正、手写来源、剪枝记忆、压感笔迹）+ 服务状态指示器（已连接/未连接/模拟模式）。
5. **.env.example 更新**：展示豆包、DeepSeek、OpenAI 三种配置方式，注释清晰。

**文件改动：**
- `server.js`：完整重写（96 → 195 行）
- `app.js`：删除 ~80 行旧 API 配置代码，改调本地代理端点
- `index.html`：设置面板从 15 行精简到 7 行
- `styles.css`：新增状态指示器样式
- `.env.example`：更新为新环境变量
- `PROJECT_STATUS.md`：本文档

**安全性：**
- API Key 仅存在于服务器 .env 文件
- .gitignore 排除 .env，确保 Key 不进入 Git
- 前端代码搜索不到任何 API Key 相关字符串

---

### 工具：
Claude Code

### 完成内容：

**核心交互闭环补齐（第 1 轮）：**
1. 真实 OCR 手写识别（笔迹渲染图片 → AI 视觉模型识别）
2. Agent 拖拽连接（从 Agent 栏拖拽到手写区域，自动识别+生成）
3. 套索选择工具（虚线框选手写区域）
4. 视觉优化（拖拽引导线、套索路径、加载动画）

---

### 工具：
Claude Code

### 完成内容：

**API Key 安全加固：**
- .gitignore、.env.example、server.js loadEnv() 等
