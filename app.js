const agents = {
      assistant: { name: "助理", short: "助", color: "#c26118" },
      tech: { name: "技术顾问", short: "技", color: "#2c7fb8" },
      exec: { name: "执行经理", short: "执", color: "#7e3aa8" },
      knowledge: { name: "知识顾问", short: "知", color: "#1b9b64" },
      product: { name: "产品经理", short: "产", color: "#cc2d21" }
    };

    const app = document.getElementById("app");
    const inkLayer = document.getElementById("inkLayer");
    const arrowLayer = document.getElementById("arrowLayer");
    const uiLayer = document.getElementById("uiLayer");
    const lassoPanel = document.getElementById("lassoPanel");
    const ocrText = document.getElementById("ocrText");
    const modeReadout = document.getElementById("modeReadout");
    const toast = document.getElementById("toast");
    const settingsSheet = document.getElementById("settingsSheet");
    const scopePopover = document.getElementById("scopePopover");
    const scopeText = document.getElementById("scopeText");
    const typedPrompt = document.getElementById("typedPrompt");
    const inkDot = document.getElementById("inkDot");
    const apiProviderInput = document.getElementById("apiProvider");
    const apiEndpointInput = document.getElementById("apiEndpoint");
    const apiModelInput = document.getElementById("apiModel");
    const apiModeInput = document.getElementById("apiMode");
    const apiKeyInput = document.getElementById("apiKey");

    let activeTool = "pen";
    let activeAgent = "assistant";
    let drawing = false;
    let currentPath = null;
    let points = [];
    let strokes = [];
    let lassoSelections = [];
    let nodes = [];
    let links = [];
    let selectedNodeId = null;
    let connectingFrom = null;
    let lastLassoBox = null;
    let nodeId = 1;
    let linkId = 1;

    const toolStyles = {
      pen: { color: "#1f2529", width: 3, opacity: 1 },
      ball: { color: "#315b88", width: 2.2, opacity: .92 },
      pencil: { color: "#5b5147", width: 2.8, opacity: .62 },
      marker: { color: "#e4b72f", width: 12, opacity: .45 }
    };

    const defaultApiConfig = {
      provider: "deepseek-proxy",
      endpoint: "/api/deepseek/chat/completions",
      model: "deepseek-v4-pro",
      mode: "chat",
      key: ""
    };

    let apiConfig = loadApiConfig();

    function loadApiConfig() {
      try {
        return { ...defaultApiConfig, ...JSON.parse(localStorage.getItem("handwritingAiApi") || "{}") };
      } catch {
        return { ...defaultApiConfig };
      }
    }

    function syncApiFields() {
      apiProviderInput.value = apiConfig.provider;
      apiEndpointInput.value = apiConfig.endpoint;
      apiModelInput.value = apiConfig.model;
      apiModeInput.value = apiConfig.mode;
      apiKeyInput.value = apiConfig.key;
    }

    function applyProviderPreset(provider) {
      if (provider === "deepseek-proxy") {
        apiEndpointInput.value = "/api/deepseek/chat/completions";
        apiModelInput.value = "deepseek-v4-pro";
        apiModeInput.value = "chat";
      }
      if (provider === "deepseek") {
        apiEndpointInput.value = "https://api.deepseek.com/chat/completions";
        apiModelInput.value = "deepseek-v4-pro";
        apiModeInput.value = "chat";
      }
      if (provider === "openai") {
        apiEndpointInput.value = "https://api.openai.com/v1/responses";
        apiModelInput.value = "gpt-4.1";
        apiModeInput.value = "responses";
      }
    }

    function normalizeEndpoint(endpoint, provider, mode) {
      const clean = endpoint.trim().replace(/\/+$/, "");
      if (provider === "deepseek-proxy") return "/api/deepseek/chat/completions";
      if (provider === "deepseek") {
        if (clean.endsWith("/anthropic")) return "https://api.deepseek.com/chat/completions";
        if (clean === "https://api.deepseek.com") return "https://api.deepseek.com/chat/completions";
        if (mode === "chat" && !clean.endsWith("/chat/completions")) return `${clean}/chat/completions`;
      }
      return clean;
    }

    function svgEl(tag, attrs = {}) {
      const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
      return el;
    }

    function pointFromEvent(event) {
      const rect = app.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top, pressure: event.pressure || .5 };
    }

    function pointInNode(event, nodeEl) {
      const rect = nodeEl.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top, pressure: event.pressure || .5 };
    }

    function pathFromPoints(list) {
      if (list.length < 2) return "";
      let path = `M ${list[0].x} ${list[0].y}`;
      for (let i = 1; i < list.length - 1; i++) {
        const midX = (list[i].x + list[i + 1].x) / 2;
        const midY = (list[i].y + list[i + 1].y) / 2;
        path += ` Q ${list[i].x} ${list[i].y} ${midX} ${midY}`;
      }
      const last = list[list.length - 1];
      path += ` L ${last.x} ${last.y}`;
      return path;
    }

    function showToast(message) {
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => toast.classList.remove("show"), 2100);
    }

    function updateReadout() {
      const toolName = {
        move: "移动",
        pen: "钢笔",
        ball: "圆珠笔",
        pencil: "铅笔",
        marker: "马克笔",
        eraser: "橡皮"
      }[activeTool];
      modeReadout.textContent = `${toolName} · ${agents[activeAgent].name}`;
      inkDot.style.background = toolStyles[activeTool]?.color || agents[activeAgent].color;
    }

    function setTool(tool) {
      activeTool = tool;
      document.querySelectorAll(".tool[data-tool]").forEach(button => {
        button.classList.toggle("active", button.dataset.tool === tool);
      });
      hideScope();
      document.querySelectorAll(".node").forEach(el => el.classList.toggle("move-enabled", tool === "move"));
      updateReadout();
    }

    function setAgent(agent, options = { deriveFromSelection: false }) {
      activeAgent = agent;
      document.querySelectorAll(".agent-row").forEach(button => {
        button.classList.toggle("active", button.dataset.agent === agent);
      });
      updateReadout();
      if (options.deriveFromSelection && selectedNodeId && !connectingFrom && lassoPanel.style.display !== "block") {
        deriveFromNode(selectedNodeId);
      }
    }

    function beginInk(event) {
      if (!["pen", "ball", "pencil", "marker", "eraser"].includes(activeTool)) return;
      if (event.target.closest(".node, .toolbar, .floating-agents, .prompt-dock, .lasso-label, .settings-sheet")) return;

      event.preventDefault();
      drawing = true;
      points = [pointFromEvent(event)];
      inkLayer.setPointerCapture?.(event.pointerId);

      if (activeTool === "eraser") return;

      const style = toolStyles[activeTool];
      currentPath = svgEl("path", {
        d: "",
        fill: "none",
        stroke: style.color,
        "stroke-width": style.width,
        "stroke-opacity": style.opacity,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-dasharray": "0"
      });
      inkLayer.appendChild(currentPath);
    }

    function moveInk(event) {
      if (!drawing) return;
      event.preventDefault();
      const point = pointFromEvent(event);
      points.push(point);

      if (activeTool === "eraser") {
        eraseAt(point);
        return;
      }

      currentPath.setAttribute("d", pathFromPoints(points));
      if (activeTool === "pen" && event.pointerType === "pen") {
        const pressureWidth = 2.2 + Math.min(1, point.pressure) * 3.2;
        currentPath.setAttribute("stroke-width", pressureWidth.toFixed(2));
      }
    }

    function endInk(event) {
      if (!drawing) return;
      drawing = false;
      inkLayer.releasePointerCapture?.(event.pointerId);

      if (activeTool === "eraser") {
        points = [];
        return;
      }

      if (!currentPath || points.length < 2) {
        currentPath?.remove();
        currentPath = null;
        return;
      }

      const stroke = { id: Date.now(), path: currentPath, points: [...points], tool: activeTool };
      strokes.push(stroke);
      if (activeTool === "marker") openMarkerPanel(stroke);

      currentPath = null;
      points = [];
    }

    function bbox(list) {
      const xs = list.map(p => p.x);
      const ys = list.map(p => p.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys)
      };
    }

    function eraseAt(point) {
      const keep = [];
      for (const stroke of strokes) {
        const hit = stroke.points.some(p => Math.hypot(p.x - point.x, p.y - point.y) < 18);
        if (hit) stroke.path.remove();
        else keep.push(stroke);
      }
      strokes = keep;

      const keepSelections = [];
      for (const selection of lassoSelections) {
        const hit = selection.points.some(p => Math.hypot(p.x - point.x, p.y - point.y) < 22);
        if (hit) {
          selection.path.remove();
          if (lastLassoBox && intersects(selection.box, lastLassoBox)) {
            lassoPanel.style.display = "none";
            lastLassoBox = null;
          }
        } else {
          keepSelections.push(selection);
        }
      }
      lassoSelections = keepSelections;

      const link = links.find(item => pointNearLink(point, item));
      if (link) cutLink(link.id);
    }

    function pointNearLink(point, link) {
      const curve = linkCurve(link);
      if (!curve) return false;
      let previous = curve[0];
      for (let i = 1; i <= 22; i++) {
        const t = i / 22;
        const current = cubicPoint(curve[0], curve[1], curve[2], curve[3], t);
        if (distanceToSegment(point, previous, current) < 16) return true;
        previous = current;
      }
      return false;
    }

    function linkCurve(link) {
      const from = findNode(link.from);
      const to = findNode(link.to);
      if (!from || !to) return null;
      const start = { x: from.x + from.width, y: from.y + 94 };
      const end = { x: to.x, y: to.y + 72 };
      const dx = Math.max(80, Math.abs(end.x - start.x) * .42);
      return [start, { x: start.x + dx, y: start.y }, { x: end.x - dx, y: end.y }, end];
    }

    function cubicPoint(a, b, c, d, t) {
      const mt = 1 - t;
      return {
        x: mt ** 3 * a.x + 3 * mt ** 2 * t * b.x + 3 * mt * t ** 2 * c.x + t ** 3 * d.x,
        y: mt ** 3 * a.y + 3 * mt ** 2 * t * b.y + 3 * mt * t ** 2 * c.y + t ** 3 * d.y
      };
    }

    function distanceToSegment(p, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
      const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }

    function openLassoPanel(box) {
      const selected = strokes.filter(stroke => intersects(bbox(stroke.points), box));
      const guessed = inferTextFromInk(selected, box);
      ocrText.value = guessed;
      lastLassoBox = box;
      lassoPanel.style.display = "block";
      lassoPanel.style.left = `${Math.min(window.innerWidth - 250, box.x + box.width + 16)}px`;
      lassoPanel.style.top = `${Math.max(82, box.y)}px`;
      showToast(`已框选 ${selected.length} 组笔迹，可修正识别结果后调用 ${agents[activeAgent].name}`);
    }

    function openMarkerPanel(stroke, nodeIdFromMarker = null) {
      const box = bbox(stroke.points);
      const selected = nodeIdFromMarker
        ? [findNode(nodeIdFromMarker)].filter(Boolean).map(node => ({ source: node.source }))
        : strokes.filter(item => item.id !== stroke.id && item.tool !== "marker" && intersects(bbox(item.points), box));
      const guessed = nodeIdFromMarker
        ? inferTextFromNodeMarker(nodeIdFromMarker)
        : inferTextFromInk(selected, box);
      ocrText.value = guessed;
      lassoPanel.style.display = "block";
      lassoPanel.style.left = `${Math.min(window.innerWidth - 250, box.x + box.width + 16)}px`;
      lassoPanel.style.top = `${Math.max(82, box.y)}px`;
      lastLassoBox = box;
      lassoPanel.dataset.nodeId = nodeIdFromMarker || "";
      showToast(nodeIdFromMarker ? "已扫过 Agent 节点内容，可调用当前 Agent 继续生成" : "已扫过画布内容，可调用当前 Agent 搜索生成");
    }

    function inferTextFromNodeMarker(nodeIdFromMarker) {
      const node = findNode(nodeIdFromMarker);
      if (!node) return "请在这里输入或修正马克笔扫过的节点内容";
      return `基于节点内容继续生成：${node.source}`;
    }

    function intersects(a, b) {
      return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    }

    function inferTextFromInk(selected, box) {
      if (typedPrompt.value.trim()) return typedPrompt.value.trim();
      if (selected.length === 0) return "请在这里输入或修正 OCR 识别文字";
      const density = selected.length > 5 ? "多段手写内容" : "一段手写内容";
      const intent = box.width > box.height * 2 ? "横向问题" : "概念草稿";
      return `${density}：${intent}，需要调研并生成可操作结论`;
    }

    function generateFallbackContent(agentKey, source, mode = "initial", parents = []) {
      const agent = agents[agentKey];
      const clean = source.replace(/\s+/g, " ").trim() || "未命名问题";
      const templates = {
        assistant: ["先拆成可回答的问题，再补齐缺口。", "把结论标注为「事实」「推断」「待验证」。", "建议下一步由技术或产品 Agent 继续派生。"],
        tech: ["识别实现路径、依赖与接口边界。", "先做本地 OCR + 节点图谱，再接入远端模型。", "高风险点是手写识别准确率与上下文裁剪。"],
        exec: ["压缩为可执行计划：目标、负责人、时间盒。", "把偏差节点剪枝，避免错误进入后续记忆。", "下一轮只保留已验证上下文。"],
        knowledge: ["提取概念、定义、例证和反例。", "把来源节点作为知识链路，不直接覆盖原文。", "建议追加一个事实核验节点。"],
        product: ["把用户动作映射为可控的上下文管理。", "核心价值是可见、可删、可嫁接、可追踪。", "MVP 先验证框选生成和上下文嗅探。"]
      };
      const intro = mode === "graft"
        ? `基于 ${parents.length} 个节点汇聚：${clean}`
        : mode === "derive"
          ? `从选中内容派生：${clean}`
          : `识别手写：${clean}`;

      return `
        <p><span class="source-line">${intro}</span></p>
        <ul>
          ${templates[agentKey].map(item => `<li>${item}</li>`).join("")}
        </ul>
      `;
    }

    function loadingContent(agentKey, source, mode, parents) {
      const clean = source.replace(/\s+/g, " ").trim() || "未命名问题";
      const prefix = mode === "graft" ? `汇聚 ${parents.length} 个节点` : mode === "derive" ? "继续生成" : "识别手写";
      return `
        <p><span class="source-line">${prefix}：${escapeHtml(clean)}</span></p>
        <ul><li>正在调用 ${agents[agentKey].name} 生成内容。</li></ul>
      `;
    }

    async function resolveGeneratedContent(agentKey, source, mode, parents) {
      if (!apiConfig.key.trim()) return generateFallbackContent(agentKey, source, mode, parents);
      try {
        const text = await callModel(agentKey, source, mode, parents);
        return renderModelText(text, agentKey, source, mode, parents);
      } catch (error) {
        showToast(`API 调用失败，已回退到本地模拟：${formatApiError(error)}`);
        return generateFallbackContent(agentKey, source, mode, parents);
      }
    }

    async function callModel(agentKey, source, mode, parents) {
      const context = parents.map(id => {
        const node = findNode(id);
        return node ? `${agents[node.agentKey].name}: ${node.source}` : "";
      }).filter(Boolean).join("\n");
      const prompt = [
        `你是${agents[agentKey].name}，请输出适合白板节点的中文内容。`,
        "要求：短、可操作、分点，不要写长文。",
        `当前操作：${mode}`,
        context ? `上游上下文：\n${context}` : "",
        `用户内容：${source}`
      ].filter(Boolean).join("\n\n");

      const endpoint = normalizeEndpoint(apiConfig.endpoint, apiConfig.provider, apiConfig.mode);
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiConfig.key.trim()}`
      };
      const body = apiConfig.mode === "chat"
        ? {
          model: apiConfig.model.trim(),
          messages: [
            { role: "system", content: "你是一个可视化白板中的 AI Agent，只输出节点内容。" },
            { role: "user", content: prompt }
          ]
        }
        : {
          model: apiConfig.model.trim(),
          input: prompt
        };

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = await response.json();
      if (apiConfig.mode === "chat") return data.choices?.[0]?.message?.content || "";
      return data.output_text || data.output?.[0]?.content?.[0]?.text || "";
    }

    function formatApiError(error) {
      if (error instanceof TypeError) return "浏览器无法直连该 API，可能是跨域限制或网络不可达，需要后端代理";
      return error.message || "未知错误";
    }

    function renderModelText(text, agentKey, source, mode, parents) {
      const clean = source.replace(/\s+/g, " ").trim() || "未命名问题";
      const intro = mode === "graft"
        ? `基于 ${parents.length} 个节点汇聚：${clean}`
        : mode === "derive"
          ? `从选中内容继续生成：${clean}`
          : `识别手写：${clean}`;
      const lines = text.split(/\n+/).map(line => line.replace(/^[-*•\d.、\s]+/, "").trim()).filter(Boolean);
      const items = (lines.length ? lines : ["模型返回为空，请调整提示词或检查 API 设置。"]).slice(0, 6);
      return `
        <p><span class="source-line">${escapeHtml(intro)}</span></p>
        <ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      `;
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function createNode({ x, y, agentKey = activeAgent, source, mode = "initial", parents = [] }) {
      const id = `n${nodeId++}`;
      const agent = agents[agentKey];
      const node = {
        id,
        agentKey,
        source,
        x: clamp(x, 28, window.innerWidth - 340),
        y: clamp(y, 88, window.innerHeight - 230),
        width: 300,
        height: 190,
        parents: [...parents],
        nodeStrokes: []
      };
      nodes.push(node);

      const el = document.createElement("article");
      el.className = "node";
      el.dataset.id = id;
      el.style.setProperty("--agent-color", agent.color);
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      el.innerHTML = `
        <svg class="node-ink-layer" aria-label="节点笔迹层"></svg>
        <header class="node-header">
          <div class="node-title"><span class="agent-face">${agent.short}</span><span class="node-kind">${agent.name}</span></div>
        </header>
        <div class="node-body">${loadingContent(agentKey, source, mode, parents)}</div>
        <button class="connector" data-action="connect" aria-label="拉线"></button>
      `;
      uiLayer.appendChild(el);
      installNodeEvents(el);
      resolveGeneratedContent(agentKey, source, mode, parents).then(html => {
        const body = el.querySelector(".node-body");
        if (body) body.innerHTML = html;
      });

      parents.forEach(parentId => addLink(parentId, id));
      renderLinks();
      selectNode(id);
      showToast(`${agent.name} 正在生成节点`);
      return node;
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function installNodeEvents(el) {
      let draggingNode = null;
      let nodeDrawing = false;
      let nodeInkPath = null;
      let nodeInkPoints = [];
      let nodeInkGlobalPoints = [];
      let start = null;

      el.addEventListener("pointerdown", event => {
        if (activeTool !== "eraser") return;
        event.preventDefault();
        event.stopPropagation();
        deleteNode(el.dataset.id);
      }, true);

      el.addEventListener("pointerdown", event => {
        if (!["pen", "ball", "pencil", "marker"].includes(activeTool)) return;
        if (event.target.closest(".connector")) return;
        event.preventDefault();
        event.stopPropagation();
        selectNode(el.dataset.id);
        const local = pointInNode(event, el);
        nodeDrawing = true;
        nodeInkPoints = [local];
        nodeInkGlobalPoints = [pointFromEvent(event)];
        const style = toolStyles[activeTool];
        nodeInkPath = svgEl("path", {
          d: "",
          fill: "none",
          stroke: style.color,
          "stroke-width": style.width,
          "stroke-opacity": style.opacity,
          "stroke-linecap": "round",
          "stroke-linejoin": "round"
        });
        el.querySelector(".node-ink-layer").appendChild(nodeInkPath);
        el.setPointerCapture(event.pointerId);
      });

      el.addEventListener("pointermove", event => {
        if (!nodeDrawing) return;
        event.preventDefault();
        event.stopPropagation();
        nodeInkPoints.push(pointInNode(event, el));
        nodeInkGlobalPoints.push(pointFromEvent(event));
        nodeInkPath.setAttribute("d", pathFromPoints(nodeInkPoints));
      });

      el.addEventListener("pointerup", event => {
        if (!nodeDrawing) return;
        nodeDrawing = false;
        el.releasePointerCapture?.(event.pointerId);
        if (nodeInkPoints.length < 2) {
          nodeInkPath?.remove();
          return;
        }
        const node = findNode(el.dataset.id);
        const stroke = { id: Date.now(), path: nodeInkPath, points: [...nodeInkGlobalPoints], tool: activeTool, nodeId: el.dataset.id };
        node.nodeStrokes = node.nodeStrokes || [];
        node.nodeStrokes.push(stroke);
        if (activeTool === "marker") openMarkerPanel(stroke, el.dataset.id);
        nodeInkPath = null;
        nodeInkPoints = [];
        nodeInkGlobalPoints = [];
      });

      el.addEventListener("pointercancel", event => {
        if (!nodeDrawing) return;
        nodeDrawing = false;
        el.releasePointerCapture?.(event.pointerId);
      });

      el.addEventListener("pointerdown", event => {
        if (activeTool !== "move") return;
        event.preventDefault();
        event.stopPropagation();
        draggingNode = findNode(el.dataset.id);
        start = { x: event.clientX, y: event.clientY, nodeX: draggingNode.x, nodeY: draggingNode.y };
        el.setPointerCapture(event.pointerId);
        selectNode(draggingNode.id);
      });

      el.addEventListener("pointermove", event => {
        if (!draggingNode) return;
        event.preventDefault();
        draggingNode.x = start.nodeX + event.clientX - start.x;
        draggingNode.y = start.nodeY + event.clientY - start.y;
        el.style.left = `${draggingNode.x}px`;
        el.style.top = `${draggingNode.y}px`;
        renderLinks();
      });

      el.addEventListener("pointerup", event => {
        draggingNode = null;
        el.releasePointerCapture?.(event.pointerId);
      });

      el.addEventListener("click", event => {
        const action = event.target.dataset.action;
        const id = el.dataset.id;
        selectNode(id);

        if (connectingFrom && connectingFrom !== id && action !== "connect") {
          graftNodes([connectingFrom, id]);
          connectingFrom = null;
          return;
        }

        if (action === "connect") startConnect(id);
        else sniffNode(id, event.clientX, event.clientY);
      });

      el.addEventListener("pointerenter", event => {
        sniffNode(el.dataset.id, event.clientX, event.clientY);
      });
      el.addEventListener("pointerleave", hideScope);
    }

    function findNode(id) {
      return nodes.find(node => node.id === id);
    }

    function selectNode(id) {
      selectedNodeId = id;
      document.querySelectorAll(".node").forEach(el => el.classList.toggle("selected", el.dataset.id === id));
    }

    function deriveFromNode(id) {
      const parent = findNode(id);
      const childX = parent.x + 360;
      const childY = parent.y + 46;
      createNode({
        x: childX,
        y: childY,
        agentKey: activeAgent,
        source: parent.source,
        mode: "derive",
        parents: [id]
      });
    }

    function startConnect(id) {
      connectingFrom = id;
      showToast("从这个节点拉出上下文：点另一个节点，或点空白处生成汇聚节点");
    }

    function graftNodes(parentIds, x, y) {
      const source = parentIds.map(id => findNode(id)?.source).filter(Boolean).join(" + ");
      const anchor = findNode(parentIds[parentIds.length - 1]);
      createNode({
        x: x ?? anchor.x + 220,
        y: y ?? anchor.y + 230,
        agentKey: activeAgent,
        source,
        mode: "graft",
        parents: parentIds
      });
      connectingFrom = null;
    }

    function deleteNode(id) {
      nodes = nodes.filter(node => node.id !== id);
      links = links.filter(link => link.from !== id && link.to !== id);
      document.querySelector(`.node[data-id="${id}"]`)?.remove();
      if (selectedNodeId === id) selectedNodeId = null;
      if (connectingFrom === id) connectingFrom = null;
      renderLinks();
      hideScope();
      showToast("已剪枝：节点和相关上下文连接已移除");
    }

    function addLink(from, to) {
      if (!from || !to || links.some(link => link.from === from && link.to === to)) return;
      links.push({ id: `l${linkId++}`, from, to });
    }

    function renderLinks() {
      arrowLayer.innerHTML = `
        <defs>
          <marker id="arrowHead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#4a5358"></path>
          </marker>
        </defs>
      `;

      for (const link of links) {
        const from = findNode(link.from);
        const to = findNode(link.to);
        if (!from || !to) continue;
        const color = agents[from.agentKey].color;
        const start = { x: from.x + from.width, y: from.y + 94 };
        const end = { x: to.x, y: to.y + 72 };
        const dx = Math.max(80, Math.abs(end.x - start.x) * .42);
        const d = `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;

        const hit = svgEl("path", { d, class: "arrow-hit", "data-link": link.id });
        const line = svgEl("path", {
          d,
          class: "arrow-path",
          "data-link": link.id,
          "marker-end": "url(#arrowHead)",
          style: `--agent-color:${color}`
        });
        hit.addEventListener("click", () => sniffLink(link.id));
        hit.addEventListener("pointerenter", event => {
          sniffLink(link.id, event.clientX, event.clientY);
        });
        hit.addEventListener("pointerleave", hideScope);
        arrowLayer.appendChild(hit);
        arrowLayer.appendChild(line);
      }
    }

    function cutLink(id) {
      const line = arrowLayer.querySelector(`.arrow-path[data-link="${id}"]`);
      line?.classList.add("arrow-cut");
      links = links.filter(link => link.id !== id);
      setTimeout(renderLinks, 180);
      showToast("已划断上下文连接：两个节点不再互相污染记忆");
    }

    function sniffNode(id, x = 0, y = 0) {
      const context = collectContext(id);
      document.querySelectorAll(".node").forEach(el => {
        el.classList.toggle("context-active", context.includes(el.dataset.id));
      });
      const names = context.map(nodeId => {
        const node = findNode(nodeId);
        return node ? `${agents[node.agentKey].name}：${node.source.slice(0, 18)}` : "";
      }).filter(Boolean);
      scopeText.textContent = names.length ? `本次模型会携带 ${names.length} 个节点：${names.join(" / ")}` : "当前节点没有上游上下文。";
      showScope(x ?? findNode(id).x + 20, y ?? findNode(id).y + 20);
    }

    function sniffLink(id, x = window.innerWidth / 2, y = 120) {
      const link = links.find(item => item.id === id);
      if (!link) return;
      sniffNode(link.to, x, y);
    }

    function collectContext(id) {
      const seen = new Set();
      function walk(nodeId) {
        if (seen.has(nodeId)) return;
        seen.add(nodeId);
        links.filter(link => link.to === nodeId).forEach(link => walk(link.from));
      }
      walk(id);
      return [...seen];
    }

    function showScope(x, y) {
      scopePopover.style.display = "block";
      scopePopover.style.left = `${clamp(x + 12, 20, window.innerWidth - 290)}px`;
      scopePopover.style.top = `${clamp(y + 12, 80, window.innerHeight - 160)}px`;
    }

    function hideScope() {
      scopePopover.style.display = "none";
      document.querySelectorAll(".node").forEach(el => el.classList.remove("context-active"));
    }

    document.querySelectorAll(".tool[data-tool]").forEach(button => {
      button.addEventListener("click", () => setTool(button.dataset.tool));
    });

    document.querySelectorAll(".agent-row").forEach(button => {
      button.addEventListener("click", () => setAgent(button.dataset.agent));
    });

    inkLayer.addEventListener("pointerdown", beginInk);
    inkLayer.addEventListener("pointermove", moveInk);
    inkLayer.addEventListener("pointerup", endInk);
    inkLayer.addEventListener("pointercancel", endInk);

    app.addEventListener("click", event => {
      if (event.target !== inkLayer && event.target !== app && event.target !== arrowLayer) return;
      if (connectingFrom) {
        const point = pointFromEvent(event);
        graftNodes([connectingFrom], point.x, point.y);
      }
    });

    document.getElementById("generateFromLasso").addEventListener("click", () => {
      if (!lastLassoBox) return;
      const parentNodeId = lassoPanel.dataset.nodeId || "";
      const parent = parentNodeId ? findNode(parentNodeId) : null;
      createNode({
        x: parent ? parent.x + 340 : lastLassoBox.x + lastLassoBox.width + 24,
        y: parent ? parent.y + 36 : lastLassoBox.y,
        agentKey: activeAgent,
        source: ocrText.value,
        mode: parent ? "derive" : "initial",
        parents: parent ? [parentNodeId] : []
      });
      lassoPanel.style.display = "none";
      lastLassoBox = null;
      lassoPanel.dataset.nodeId = "";
    });

    document.getElementById("cancelLasso").addEventListener("click", () => {
      lassoPanel.style.display = "none";
      lastLassoBox = null;
      lassoPanel.dataset.nodeId = "";
    });

    document.getElementById("sendPrompt").addEventListener("click", () => {
      const text = typedPrompt.value.trim();
      if (!text) return;
      createNode({ x: 110, y: 160 + nodes.length * 26, agentKey: activeAgent, source: text });
      typedPrompt.value = "";
    });

    typedPrompt.addEventListener("keydown", event => {
      if (event.key === "Enter") document.getElementById("sendPrompt").click();
    });

    document.getElementById("voiceBtn").addEventListener("click", () => {
      typedPrompt.value = "语音转写：请评估这个方案的技术风险和下一步行动";
      showToast("语音输入已转写为文字，可提交或继续修改");
    });

    document.getElementById("settingsBtn").addEventListener("click", () => {
      settingsSheet.style.display = settingsSheet.style.display === "block" ? "none" : "block";
    });

    apiProviderInput.addEventListener("change", () => {
      applyProviderPreset(apiProviderInput.value);
    });

    document.getElementById("saveApiSettings").addEventListener("click", () => {
      const provider = apiProviderInput.value;
      const mode = apiModeInput.value;
      apiConfig = {
        provider,
        endpoint: normalizeEndpoint(apiEndpointInput.value || defaultApiConfig.endpoint, provider, mode),
        model: apiModelInput.value.trim() || defaultApiConfig.model,
        mode,
        key: apiKeyInput.value.trim()
      };
      syncApiFields();
      localStorage.setItem("handwritingAiApi", JSON.stringify(apiConfig));
      showToast(apiConfig.key ? "API 设置已保存，之后生成会调用模型" : "API 设置已保存；未填写 Key 时使用本地模拟");
    });

    document.getElementById("undoBtn").addEventListener("click", () => {
      const stroke = strokes.pop();
      if (stroke) stroke.path.remove();
    });

    document.getElementById("clearBtn").addEventListener("click", () => {
      strokes.forEach(stroke => stroke.path.remove());
      lassoSelections.forEach(selection => selection.path.remove());
      strokes = [];
      lassoSelections = [];
      lassoPanel.style.display = "none";
      lastLassoBox = null;
      lassoPanel.dataset.nodeId = "";
      showToast("已清空手写层，AI 节点和上下文连接保留");
    });

    window.addEventListener("resize", renderLinks);

    function seedDemo() {
      createNode({
        x: 92,
        y: 142,
        agentKey: "knowledge",
        source: "超级个体应用：用户希望把手写思考变成可管理的 AI 上下文",
        mode: "initial"
      });
      createNode({
        x: 530,
        y: 118,
        agentKey: "tech",
        source: "识别手写内容，调用 Agent 生成结构化输出",
        mode: "derive",
        parents: ["n1"]
      });
      createNode({
        x: 520,
        y: 396,
        agentKey: "product",
        source: "可视化、可操控、可剪枝的 AI 共思考画布",
        mode: "derive",
        parents: ["n1"]
      });
      createNode({
        x: 910,
        y: 246,
        agentKey: "exec",
        source: "把技术和产品结论合并成 MVP 路线",
        mode: "graft",
        parents: ["n2", "n3"]
      });
      selectedNodeId = null;
      document.querySelectorAll(".node").forEach(el => el.classList.remove("selected"));
    }

    syncApiFields();
    updateReadout();
    seedDemo();
    showToast("先用钢笔写字，再切到套索框选，调用右侧 Agent 生成节点");
