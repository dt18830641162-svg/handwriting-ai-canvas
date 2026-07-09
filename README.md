# InkScope — 手写交互式 AI Canvas

InkScope 是一个基于手写白板的 AI 协作工具。用户可以用手写笔输入内容，通过 AI Agent 进行分析、生成和派生，所有交互以可视化节点和连接箭头的形式展现在无限画布上。

## 核心功能

- **新手引导** — 首次访问自动弹出使用说明，6 步上手流程
- **手写绘制 & OCR 识别** — 用钢笔工具手写，套索框选后自动调用视觉模型识别文字
- **5 个可自定义 AI Agent** — 助理、技术顾问、执行经理、知识顾问、产品经理，每个 Agent 有独立的角色说明、颜色和 skills
- **可视化节点系统** — Agent 生成的内容以卡片节点展示，支持内部滚动、文字选中二次生成，loading 动画反馈
- **连接箭头管理** — 5 种关系类型（派生/引用/补充/对比/合并），支持自由拖拽连线和箭头编辑
- **iPad 风格工具托盘** — 底部悬浮大圆角托盘，钢笔/套索/橡皮/移动/剪刀/垃圾桶 6 个工具
- **画布平移** — 手形工具拖拽平移整个画布视图
- **一键重置** — 设置面板中可重置画布为示例状态
- **友好错误提示** — API 调用失败时自动回退本地模拟内容
- **安全后端代理** — 所有 AI 请求走后端 /api/chat 和 /api/ocr，前端不暴露任何 API Key

## 本地启动

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env，至少填入 DOUBAO_API_KEY 和 DOUBAO_CHAT_MODEL

# 2. 安装依赖（无需额外依赖，仅使用 Node.js 内置模块）
# 3. 启动服务
node server.js
```

访问 `http://localhost:8078`

## 部署到 Render

1. 在 Render 创建 Web Service
2. 关联 GitHub 仓库
3. 设置环境变量（见下方说明）
4. Start Command: `node server.js`

## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `DOUBAO_API_KEY` | 豆包 API Key | ✅ |
| `DOUBAO_CHAT_MODEL` | 豆包推理接入点 ID（ep-xxx） | ✅ |
| `DOUBAO_OCR_MODEL` | OCR 模型接入点（默认同 CHAT_MODEL） | 可选 |
| `DOUBAO_BASE_URL` | 豆包 API 地址 | 可选 |
| `DEFAULT_TEXT_PROVIDER` | 文本生成服务商 | 可选 |
| `DEFAULT_OCR_PROVIDER` | OCR 服务商 | 可选 |
| `PORT` | 服务端口（默认 8078） | 可选 |
| `ENABLE_DEV_SETTINGS` | 开发者模式（默认 false） | 可选 |

## 安全说明

- **永远不要提交 `.env` 文件** — 已在 `.gitignore` 中排除
- 所有 API Key 在后端管理，前端无法访问
- 前端只请求 `/api/chat`、`/api/ocr`、`/api/health`，不直接调用外部 AI API
- 设置面板默认不显示任何 API 配置项

## 项目结构

```
index.html       — 页面结构
styles.css       — 页面样式
app.js           — 前端交互逻辑
server.js        — 本地服务 + AI 代理
assets/icons/    — 工具图标（SVG）
.env.example     — 环境变量模板
```

## 线上版本

当前稳定版本：**v0.1-online-demo**

已部署至 Render，线上可访问。

## License

MIT
