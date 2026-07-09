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

1. 临时套索选区识别（套索选择 → 自动 OCR → 调用 Agent）
2. Agent 角色自定义（用户可添加/编辑/删除 Agent）
3. Content 内容管理栏（左侧内容列表）
4. iPad 端触摸和 Apple Pencil 体验优化
5. 节点上下文管理可视化增强

## 最近一次修改记录

---

### 工具：
Claude Code

### 完成内容：

**修复 .env 环境变量加载（第 7 轮）：**

**问题根因：**
`getProvider()` 中 `.env` 回退分支检查的变量名是 `DOUBAO_ENDPOINT`，但 `.env` 文件中实际配置的是 `DOUBAO_CHAT_MODEL`。变量名不匹配导致 `envEndpoint` 始终为空字符串，`getProvider()` 返回 `null`，服务启动时显示"豆包 API：未配置"。

**修复内容：**
1. `getProvider()` 中 `DOUBAO_ENDPOINT` → `DOUBAO_CHAT_MODEL`
2. OCR 模型独立读取 `DOUBAO_OCR_MODEL`，回退到 `DOUBAO_CHAT_MODEL`
3. `DOUBAO_BASE_URL` 从 `.env` 读取，不再硬编码
4. `loadEnv()` 增加 UTF-8 BOM 处理和加载计数日志
5. 文件未找到时打印提示而非静默跳过

**验证结果：**
- `node server.js` 启动输出：`[InkScope] 已从 .env 加载 6 个环境变量` + `豆包 API: 已配置`
- `/api/health` 返回 `{"status":"ok","textProvider":"doubao",...}`
- `/api/chat` 正常返回 AI 响应
- `/api/ocr` 正常路由

**文件改动：**
- `server.js`：`loadEnv()` 加强健壮性、`getProvider()` 修复变量名匹配

**未修改：**
- `.env` — 无改动
- `index.html`、`app.js`、`styles.css` — 无改动



---

### 工具：
Claude Code

### 完成内容：

**前端 API 安全加固 — 移除 API 配置泄露（第 6 轮）：**

1. **移除前端 API 配置表单**：
   - 设置面板标题从「API 设置」→「设置」
   - 移除公开可见的 API Key 输入框、接入点名称输入框、保存按钮
   - 替换为 4 个用户交互开关：自动 OCR 修正、保留手写来源、剪枝记忆移除、压感笔迹
   - 开关状态保存到 `inkscope_user_settings`（localStorage），不包含任何 API 敏感信息

2. **开发者模式（默认关闭）**：
   - API 配置表单移至 `<div id="devSettingsSection" style="display:none">` 内，默认不可见
   - 仅当后端设置 `ENABLE_DEV_SETTINGS=true` 时，`/api/health` 返回 `devSettingsEnabled: true`
   - 前端 `checkHealth()` 检测到 `devSettingsEnabled === true` 后才调用 `setupDevSettingsIfEnabled()` 显示表单
   - 开发者模式下的 API Key 保存到独立键 `inkscope_dev_settings`

3. **清理旧数据**：
   - 启动时执行 `localStorage.removeItem("inkscope_api_settings")` 清理历史遗留的 API 配置

4. **后端增强**：
   - `server.js` 的 `/api/health` 新增 `devSettingsEnabled` 字段
   - 读取 `process.env.ENABLE_DEV_SETTINGS`，默认 `undefined` → `false`

**安全验证结果：**
- 普通用户访问页面：看不到任何 API Key 输入框 ✓
- 设置面板只显示：服务状态 + 4 个交互开关 ✓
- `devSettingsEnabled` 默认 `false` ✓
- 前端不直接调用外部 AI API ✓
- 所有 AI 请求走 `/api/chat`、`/api/ocr` ✓

**文件改动：**
- `index.html`：设置面板重写（+4 个开关，-2 个 API 输入框移至隐藏区域）
- `app.js`：删除旧 API 设置管理代码，新增 `loadUserSettings`/`saveUserSettings`、`setupDevSettingsIfEnabled`、旧数据清理
- `server.js`：`/api/health` 新增 `devSettingsEnabled` 字段
- `styles.css`：新增 `.toggle-row`、`.settings-section-title` 样式，替换旧的 toggle 样式

**未修改：**
- `.env` — 无改动
- `/api/chat`、`/api/ocr`、`/api/config` — 保持不变
- API Key 仍在后端 .env 中管理



---

### 工具：
Claude Code

### 完成内容：

**UI/UX 优化与交互增强（第 5 轮）：**

1. **精简画笔工具**：
   - 底部工具栏从 8 个工具精简为 5 个核心工具：移动、钢笔、套索、橡皮、撤销
   - 移除：圆珠笔、铅笔、马克笔（多余的笔刷类型不再显示）
   - 保留清空手写按钮
   - `toolStyles` 精简为 `pen` 和 `select` 两项
   - `updateReadout()` 和 `beginInk()` 移除已删除工具的引用

2. **Icon 视觉优化**：
   - 所有工具图标替换为简洁的 24×24 线性 SVG 风格
   - 移动工具：十字准星光标
   - 钢笔工具：钢笔尖
   - 套索工具：虚线矩形选择框
   - 橡皮工具：斜角橡皮擦
   - 撤销：回退箭头
   - 清空：垃圾桶
   - 图标统一使用 `stroke-width: 1.8`、`stroke-linecap: round`

3. **Agent 栏排版修复**：
   - `.floating-agents` 宽度从 150px → 172px
   - `.agent-name` 添加 `white-space: nowrap`、`overflow: hidden`、`text-overflow: ellipsis`
   - Agent 行 grid 调整为 4 列（头像/名称/徽标/编辑按钮）
   - 字号从 16px → 14px 防止溢出

4. **自由连接拖拽**：
   - 新增连接器拖拽：从一个节点右侧连接点拖拽到另一个节点，松开即建立箭头连接
   - 拖拽时显示虚线引导线（复用 `dragLayer`）
   - 拖拽到另一个节点 → 创建连接；拖到空白处 → 取消
   - 阻止自连接和重复连接
   - 创建/修改/删除连接时自动保存到 localStorage

5. **连接关系持久化**：
   - `saveLinks()` / `loadLinks()` 将 `links` 数组保存到 `localStorage` 的 `inkscope_links` 键
   - 启动时在 `seedDemo()` 后调用 `loadLinks()` 恢复之前保存的连接
   - 只恢复两端节点都存在的有效连接
   - `cutLink()`、`updateLinkType()`、`reverseLinkDirection()`、`deleteNode()` 均自动保存

6. **清除节点手写痕迹**：
   - `generateFromLasso` 点击后：如果来源节点有 `nodeStrokes`（在节点上书写的笔迹），自动清除其 SVG 元素并清空数组
   - 识别后的内容只保留文本，不再附带手写笔迹作为背景

**文件改动：**
- `index.html`：工具栏精简（-3 个按钮），全部工具图标替换为新 SVG，viewBox 统一为 24×24
- `styles.css`：Agent 面板宽度调整、名称省略号、图标尺寸、新增连接拖拽线样式
- `app.js`：`toolStyles` 精简、`updateReadout` 精简、`beginInk`/`endInk` 移除马克笔、`installNodeEvents` 新增连接器拖拽、`saveLinks`/`loadLinks` 新增、`generateFromLasso` 清除节点笔迹、多处添加 `saveLinks()` 调用

**未修改：**
- `server.js`、`.env` — 无改动
- `/api/chat`、`/api/ocr`、`/api/health` — 保持不变
- API Key 不暴露



---

### 工具：
Claude Code

### 完成内容：

**Agent 编辑与箭头管理系统（第 4 轮）：**

1. **Agent 可编辑 + localStorage 持久化**：
   - `agents` 改为可变对象，配置保存在 `localStorage` 的 `inkscope_agents` 键下
   - 新增 `loadAgents()`（启动时加载，合并默认值）、`saveAgents()`（保存并刷新 UI）
   - 每个 Agent 增加 `roleDesc`（角色说明）和 `skills`（能力标签数组）字段
   - `DEFAULT_AGENTS` 保留出厂设置，支持「恢复默认」一键重置

2. **Agent 编辑面板**：
   - 每个 Agent 行右侧新增 ✎ 编辑按钮（hover 时显示）
   - 编辑面板支持修改：名称、简称、颜色、角色说明、Skills
   - Skills 用逗号/顿号分隔输入，自动解析为数组
   - 保存后自动刷新 Agent 列表、状态栏和箭头颜色

3. **Agent 列表动态渲染**：
   - `renderAgentList()` 从 `agents` 对象动态生成 Agent 按钮
   - `bindAgentRowEvents()` 绑定点击/拖拽事件（通过克隆节点避免重复绑定）
   - Agent 行 badge 数字显示 skills 数量

4. **箭头关系类型系统**：
   - 新增 5 种关系类型：`derive`（派生）、`reference`（引用）、`supplement`（补充）、`compare`（对比）、`merge`（合并）
   - `LINK_TYPES` 定义每种类型的标签和视觉样式（虚线/实线/线宽）
   - `addLink()` 支持可选的 `type` 参数，默认 `"derive"`
   - `renderLinks()` 根据类型渲染不同 `stroke-dasharray` 和 `stroke-width`，并在箭头中点显示关系标签

5. **箭头编辑面板**：
   - 点击任意箭头 → 弹出浮动编辑面板（`arrowEditPanel`）
   - 可修改关系类型（下拉选择 5 种类型）
   - 「反转方向」按钮交换 `from`/`to`
   - 「删除连接」按钮移除箭头
   - 面板自动定位到点击位置附近

6. **Agent skills 纳入 prompt**：
   - `callModel()` 从 `agents[agentKey]` 读取实际的 `roleDesc` 和 `skills`
   - System prompt 包含：角色名称 + 角色说明 + 核心能力（skills 列表）

**文件改动：**
- `app.js`：+~120 行，新增 `DEFAULT_AGENTS`、`loadAgents`、`saveAgents`、`LINK_TYPES`、`renderAgentList`、`bindAgentRowEvents`、`bindAgentEditEvents`、Agent 编辑函数、箭头编辑函数；修改 `addLink`、`renderLinks`、`callModel`、初始化流程；删除旧的硬编码 Agent 事件绑定
- `index.html`：Agent 列表改为 `<div id="agentList">` 动态容器；新增 `arrowEditPanel`（箭头编辑面板）、`agentEditPanel`（Agent 编辑面板）
- `styles.css`：+~150 行，新增 `.arrow-edit-panel`、`.arrow-label`、`.agent-edit-btn`、`.agent-edit-panel`、`.agent-edit-field`、`.mini-btn.danger` 等样式

**交互说明：**
- 编辑 Agent：hover Agent 行 → 点击 ✎ → 修改属性 → 保存（localStorage 持久化）
- 编辑箭头：点击画布上的箭头 → 弹出面板 → 改类型/反转/删除
- 删除箭头后，两个节点的上下文关联断开，不影响节点本身



---

### 工具：
Claude Code

### 完成内容：

**节点派生与 Agent 输出增强（第 3 轮）：**

1. **选中节点 + 点击 Agent = 二次生成**：用户选中任意 Agent 生成的内容节点后，点击左侧 Agent 栏中的任意 Agent（可与原节点不同），自动创建新的派生节点并通过连接箭头关联到来源节点。派生后自动切换到新节点选中状态。
2. **跨 Agent 派生**：`deriveFromNode()` 支持 `agentKeyOverride` 参数，允许用不同 Agent 对同一节点进行多角度分析（如先用「知识」分析，再用「执行」落地）。
3. **Agent 输出内容更完整**：为每个 Agent 角色定义了详细的系统提示词（`roleDescriptions`），明确其输出风格和分析维度。`callModel()` 的 prompt 要求结构化输出（结论概括 + 3-5 个分析要点）。离线 fallback 模板从 3 条扩展为 4 条，内容更具体可操作。
4. **节点卡片内部滚动**：节点 `.node` 设置 `max-height: 420px` 和 `flex-direction: column`，正文区域 `.node-body` 设置 `overflow-y: auto`，防止内容过多时撑大画布。

**文件改动：**
- `app.js`：`setAgent()` 简化、Agent 行点击事件增加派生逻辑、`deriveFromNode()` 支持指定 Agent、`callModel()` prompt 重写、`generateFallbackContent()` 模板扩展
- `styles.css`：`.node` 增加 flex 布局和 max-height、`.node-body` 增加内部滚动
- `PROJECT_STATUS.md`：本文档

**交互示例：**
1. 选中「知识顾问」生成的节点 → 点击 Agent 栏「技术顾问」→ 自动创建技术分析节点，箭头连接回原节点
2. 选中任意节点 → 点击「执行经理」→ 自动生成可执行计划节点



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
