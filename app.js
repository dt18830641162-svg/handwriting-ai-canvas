const DEFAULT_AGENTS = {
      assistant: { name: "助理", short: "助", color: "#c26118", roleDesc: "综合助理，擅长拆解复杂问题、梳理逻辑、给出可执行的建议。", skills: ["问题拆解", "逻辑梳理", "结论归类", "行动建议"] },
      tech: { name: "技术顾问", short: "技", color: "#2c7fb8", roleDesc: "资深技术顾问，擅长架构设计、技术选型和实现路径分析。", skills: ["架构设计", "技术选型", "实现路径", "风险评估"] },
      exec: { name: "执行经理", short: "执", color: "#7e3aa8", roleDesc: "执行经理，擅长把想法转化为可执行的计划。", skills: ["目标拆解", "里程碑规划", "时间线管理", "风险识别"] },
      knowledge: { name: "知识顾问", short: "知", color: "#1b9b64", roleDesc: "知识顾问，擅长提炼概念、提供例证和构建知识框架。", skills: ["概念提炼", "例证收集", "知识框架", "事实核验"] },
      product: { name: "产品经理", short: "产", color: "#cc2d21", roleDesc: "产品经理，擅长从用户价值出发分析需求和设计功能。", skills: ["用户场景", "功能设计", "优先级判断", "成功指标"] }
    };

    function loadAgents() {
      try {
        const saved = localStorage.getItem("inkscope_agents");
        if (saved) {
          const parsed = JSON.parse(saved);
          for (const key of Object.keys(DEFAULT_AGENTS)) {
            if (!parsed[key]) parsed[key] = { ...DEFAULT_AGENTS[key] };
            else {
              parsed[key].name = parsed[key].name || DEFAULT_AGENTS[key].name;
              parsed[key].short = parsed[key].short || DEFAULT_AGENTS[key].short;
              parsed[key].color = parsed[key].color || DEFAULT_AGENTS[key].color;
              parsed[key].roleDesc = parsed[key].roleDesc || DEFAULT_AGENTS[key].roleDesc;
              parsed[key].skills = parsed[key].skills || [...DEFAULT_AGENTS[key].skills];
            }
          }
          return parsed;
        }
      } catch { /* ignore */ }
      return JSON.parse(JSON.stringify(DEFAULT_AGENTS));
    }

    function saveAgents() {
      localStorage.setItem("inkscope_agents", JSON.stringify(agents));
      renderAgentList();
      updateReadout();
      renderLinks();
    }

    let agents = loadAgents();

    // ── 箭头关系类型 ──
    const LINK_TYPES = {
      derive: { label: "派生", dash: "none", width: 2.4 },
      reference: { label: "引用", dash: "8 5", width: 2 },
      supplement: { label: "补充", dash: "4 4", width: 2 },
      compare: { label: "对比", dash: "14 4 3 4", width: 2.2 },
      merge: { label: "合并", dash: "none", width: 3.6 }
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
    const statusIndicator = document.getElementById("statusIndicator");
    const statusLabel = document.getElementById("statusLabel");

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
    let agentDragActive = false;
    let agentDragAgent = null;
    let agentDragStart = null;
    let agentDragStarted = false;
    let lassoDrawing = false;
    let lassoPath = null;
    let lassoPoints = [];

    // ── 画布平移 ──
    let panX = 0, panY = 0;
    let isPanning = false;
    let panStart = null;

    function updateStageTransform() {
      document.getElementById("stage").style.transform = `translate(${panX}px, ${panY}px)`;
    }

    const toolStyles = {
      pen: { color: "#1f2529", width: 3, opacity: 1 },
      select: { color: "#2c7fb8", width: 2, opacity: .85 }
    };

    let serverOnline = false;
    let serverProvider = "";
    let devSettingsEnabled = false;

    // ── 用户设置（仅交互开关，不涉及 API Key）──
    function loadUserSettings() {
      try {
        const saved = JSON.parse(localStorage.getItem("inkscope_user_settings") || "{}");
        document.getElementById("toggleOcrCorrection").checked = saved.ocrCorrection !== false;
        document.getElementById("toggleKeepSource").checked = saved.keepSource !== false;
        document.getElementById("togglePruneMemory").checked = saved.pruneMemory !== false;
        document.getElementById("togglePressure").checked = saved.pressure !== false;
      } catch { /* ignore */ }
    }

    function saveUserSettings() {
      localStorage.setItem("inkscope_user_settings", JSON.stringify({
        ocrCorrection: document.getElementById("toggleOcrCorrection").checked,
        keepSource: document.getElementById("toggleKeepSource").checked,
        pruneMemory: document.getElementById("togglePruneMemory").checked,
        pressure: document.getElementById("togglePressure").checked
      }));
    }

    ["toggleOcrCorrection", "toggleKeepSource", "togglePruneMemory", "togglePressure"].forEach(id => {
      document.getElementById(id).addEventListener("change", saveUserSettings);
    });

    // ── 开发者模式：仅在 ENABLE_DEV_SETTINGS=true 时显示前端 API 配置 ──
    function setupDevSettingsIfEnabled() {
      const devSection = document.getElementById("devSettingsSection");
      if (!devSettingsEnabled) {
        devSection.style.display = "none";
        return;
      }
      devSection.style.display = "block";
      const apiKeyInput = document.getElementById("apiKeyInput");
      const endpointInput = document.getElementById("endpointInput");
      const settingsSaveBtn = document.getElementById("settingsSaveBtn");

      // 从 localStorage 恢复（仅开发者模式）
      try {
        const saved = JSON.parse(localStorage.getItem("inkscope_dev_settings") || "{}");
        if (saved.apiKey) apiKeyInput.value = saved.apiKey;
        if (saved.endpoint) endpointInput.value = saved.endpoint;
      } catch { /* ignore */ }

      settingsSaveBtn.addEventListener("click", async () => {
        const apiKey = apiKeyInput.value.trim();
        const endpoint = endpointInput.value.trim();
        if (!apiKey || !endpoint) { showToast("请输入 API Key 和接入点名称"); return; }
        localStorage.setItem("inkscope_dev_settings", JSON.stringify({ apiKey, endpoint }));
        try {
          await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiKey, endpoint })
          });
        } catch { /* server might not be running */ }
        await checkHealth();
        showToast(serverOnline ? "开发者 API 已连接" : "连接失败，请检查配置");
      });
    }

    // 清理旧版 API 设置（从生产模式迁移）
    localStorage.removeItem("inkscope_api_settings");

    async function checkHealth() {
      try {
        const resp = await fetch("/api/health");
        const data = await resp.json();
        serverOnline = data.status === "ok";
        serverProvider = data.textProvider || "";
        devSettingsEnabled = data.devSettingsEnabled === true;
        if (serverOnline) {
          statusIndicator.className = "status-indicator online";
          statusLabel.textContent = `已连接 · ${serverProvider}`;
        } else {
          statusIndicator.className = "status-indicator offline";
          statusLabel.textContent = data.configured?.length
            ? "服务未连接 · 请检查后端配置"
            : "未配置 Key · 模拟模式";
        }
        setupDevSettingsIfEnabled();
      } catch {
        serverOnline = false;
        statusIndicator.className = "status-indicator offline";
        statusLabel.textContent = "服务未启动 · 模拟模式";
      }
    }

    function svgEl(tag, attrs = {}) {
      const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
      return el;
    }

    function pointFromEvent(event) {
      const rect = app.getBoundingClientRect();
      return { x: event.clientX - rect.left - panX, y: event.clientY - rect.top - panY, pressure: event.pressure || .5 };
    }

    // ── 重置画布视图 ──
    function resetView() {
      panX = 0; panY = 0;
      updateStageTransform();
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
      const toolName = { move: "移动", pen: "钢笔", eraser: "橡皮", select: "套索", cut: "裁剪", trash: "删除" }[activeTool] || activeTool;
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
      app.style.cursor = tool === "move" ? "grab" : tool === "cut" ? "pointer" : tool === "trash" ? "pointer" : "";
      updateReadout();
    }

    function setAgent(agent) {
      activeAgent = agent;
      document.querySelectorAll(".agent-row").forEach(button => {
        button.classList.toggle("active", button.dataset.agent === agent);
      });
      updateReadout();
    }

    // ── 动态渲染 Agent 列表 ──
    function renderAgentList() {
      const container = document.getElementById("agentList");
      if (!container) return;
      container.innerHTML = Object.entries(agents).map(([key, agent]) => `
        <button class="agent-row${activeAgent === key ? ' active' : ''}" data-agent="${key}" style="--agent-color: ${agent.color}">
          <span class="agent-face">${agent.short}</span>
          <span class="agent-name">${agent.name}</span>
          <span class="agent-badge" style="background:${agent.color}">${agent.skills ? agent.skills.length : 0}</span>
          <span class="agent-edit-btn" data-edit-agent="${key}" title="编辑 Agent">✎</span>
        </button>
      `).join("");
      bindAgentRowEvents();
      bindAgentEditEvents();
    }

    function bindAgentRowEvents() {
      document.querySelectorAll(".agent-row").forEach(button => {
        // 移除旧事件（通过克隆节点）
        const clone = button.cloneNode(true);
        button.parentNode.replaceChild(clone, button);

        clone.addEventListener("click", event => {
          // 如果点击的是编辑按钮则不触发选择
          if (event.target.closest(".agent-edit-btn")) return;
          if (agentDragStarted) return;
          const agentKey = clone.dataset.agent;
          if (selectedNodeId && !connectingFrom && lassoPanel.style.display !== "block") {
            deriveFromNode(selectedNodeId, agentKey);
            return;
          }
          setAgent(agentKey);
        });
        clone.addEventListener("pointerdown", event => {
          if (event.button && event.button !== 0) return;
          if (event.target.closest(".agent-edit-btn")) return;
          agentDragAgent = clone.dataset.agent;
          const rect = clone.getBoundingClientRect();
          agentDragStart = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          agentDragStarted = false;
        });
      });
    }

    // ── Agent 编辑 ──
    let editingAgentKey = null;

    function bindAgentEditEvents() {
      document.querySelectorAll(".agent-edit-btn").forEach(btn => {
        btn.addEventListener("click", event => {
          event.stopPropagation();
          event.preventDefault();
          editingAgentKey = btn.dataset.editAgent;
          openAgentEditPanel(editingAgentKey);
        });
      });
    }

    function openAgentEditPanel(agentKey) {
      const agent = agents[agentKey];
      if (!agent) return;
      const panel = document.getElementById("agentEditPanel");
      document.getElementById("editAgentKey").value = agentKey;
      document.getElementById("editAgentName").value = agent.name;
      document.getElementById("editAgentShort").value = agent.short;
      document.getElementById("editAgentColor").value = agent.color;
      document.getElementById("editAgentRoleDesc").value = agent.roleDesc || "";
      document.getElementById("editAgentSkills").value = (agent.skills || []).join("、");
      document.getElementById("editAgentTitle").textContent = `编辑 Agent：${agent.name}`;
      panel.style.display = "block";
    }

    function closeAgentEditPanel() {
      document.getElementById("agentEditPanel").style.display = "none";
      editingAgentKey = null;
    }

    function saveAgentEdit() {
      if (!editingAgentKey) return;
      const agent = agents[editingAgentKey];
      if (!agent) return;
      agent.name = document.getElementById("editAgentName").value.trim() || agent.name;
      agent.short = document.getElementById("editAgentShort").value.trim() || agent.short;
      agent.color = document.getElementById("editAgentColor").value || agent.color;
      agent.roleDesc = document.getElementById("editAgentRoleDesc").value.trim();
      agent.skills = document.getElementById("editAgentSkills").value
        .split(/[,，、\s]+/)
        .map(s => s.trim())
        .filter(Boolean);
      saveAgents();
      closeAgentEditPanel();
      showToast(`${agent.name} 已保存`);
    }

    function resetAgentToDefault() {
      if (!editingAgentKey) return;
      const def = DEFAULT_AGENTS[editingAgentKey];
      if (!def) return;
      agents[editingAgentKey] = JSON.parse(JSON.stringify(def));
      saveAgents();
      openAgentEditPanel(editingAgentKey);
      showToast(`${def.name} 已恢复默认设置`);
    }

    document.getElementById("saveAgentEdit").addEventListener("click", saveAgentEdit);
    document.getElementById("closeAgentEditPanel").addEventListener("click", closeAgentEditPanel);
    document.getElementById("resetAgentDefault").addEventListener("click", resetAgentToDefault);

    function beginInk(event) {
      // ── 套索/选择 ──
      if (activeTool === "select") {
        event.preventDefault();
        if (event.target.closest(".node, .toolbar, .floating-agents, .prompt-dock, .lasso-label, .settings-sheet")) return;
        lassoDrawing = true;
        lassoPoints = [pointFromEvent(event)];
        inkLayer.setPointerCapture?.(event.pointerId);
        lassoPath = svgEl("path", {
          d: "", fill: "rgba(44,127,184,.07)", stroke: "#2c7fb8",
          "stroke-width": "2", "stroke-dasharray": "8 6", class: "lasso-path"
        });
        inkLayer.appendChild(lassoPath);
        return;
      }
      // ── 移动画布 ──
      if (activeTool === "move") {
        if (event.target.closest(".node, .toolbar, .floating-agents, .prompt-dock, .lasso-label, .settings-sheet")) return;
        event.preventDefault();
        isPanning = true;
        panStart = { x: event.clientX, y: event.clientY, panX, panY };
        inkLayer.setPointerCapture?.(event.pointerId);
        app.style.cursor = "grabbing";
        return;
      }
      // ── 连接工具 ──
      if (activeTool === "connect") return;
      // ── 钢笔 / 橡皮 ──
      if (!["pen", "eraser"].includes(activeTool)) return;
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
      // ── 画布平移中 ──
      if (isPanning) {
        event.preventDefault();
        panX = panStart.panX + (event.clientX - panStart.x);
        panY = panStart.panY + (event.clientY - panStart.y);
        updateStageTransform();
        return;
      }
      // ── 套索绘制中 ──
      if (lassoDrawing) {
        event.preventDefault();
        const point = pointFromEvent(event);
        lassoPoints.push(point);
        lassoPath.setAttribute("d", pathFromPoints(lassoPoints));
        return;
      }
      // ── 钢笔/橡皮绘制中 ──
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
      // ── 结束画布平移 ──
      if (isPanning) {
        isPanning = false;
        inkLayer.releasePointerCapture?.(event.pointerId);
        app.style.cursor = "grab";
        return;
      }
      // ── 结束套索绘制 ──
      if (lassoDrawing) {
        lassoDrawing = false;
        inkLayer.releasePointerCapture?.(event.pointerId);
        if (lassoPoints.length < 3) {
          lassoPath?.remove(); lassoPath = null; lassoPoints = []; return;
        }
        const box = bbox(lassoPoints);
        const selected = strokes.filter(s => s.tool !== "marker" && intersects(bbox(s.points), box));
        if (selected.length === 0) {
          lassoPath?.remove(); lassoPath = null; lassoPoints = [];
          showToast("套索区域没有手写内容，请框选笔迹区域");
          return;
        }
        const sel = { id: Date.now(), path: lassoPath, points: [...lassoPoints], box };
        lassoSelections.push(sel);
        openLassoPanelForStrokes(selected, box);
        lassoPath = null; lassoPoints = [];
        return;
      }
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

    async function openMarkerPanel(stroke, nodeIdFromMarker = null) {
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
      lassoPanel.dataset.fromSelect = "";

      if (!nodeIdFromMarker && selected.length > 0) {
        ocrText.value = "正在识别手写内容...";
        ocrText.classList.add("ocr-loading");
        try {
          const imageDataUrl = renderStrokesToImage(selected, box);
          const recognized = await ocrFromImage(imageDataUrl);
          if (recognized && recognized.length > 0) {
            ocrText.value = recognized;
            showToast(`已识别手写内容，可调用 ${agents[activeAgent].name}`);
          } else {
            ocrText.value = guessed;
            showToast("已扫过画布内容，可调用当前 Agent 搜索生成");
          }
        } catch {
          ocrText.value = guessed;
          showToast("已扫过画布内容，可调用当前 Agent 搜索生成");
        } finally {
          ocrText.classList.remove("ocr-loading");
        }
      } else {
        showToast(nodeIdFromMarker ? "已扫过 Agent 节点内容，可调用当前 Agent 继续生成" : "已扫过画布内容，可调用当前 Agent 搜索生成");
      }
    }

    async function openLassoPanelForStrokes(selected, box) {
      const guessed = inferTextFromInk(selected, box);
      ocrText.value = guessed;
      lastLassoBox = box;
      lassoPanel.style.display = "block";
      lassoPanel.style.left = `${Math.min(window.innerWidth - 250, box.x + box.width + 16)}px`;
      lassoPanel.style.top = `${Math.max(82, box.y)}px`;
      lassoPanel.dataset.nodeId = "";
      lassoPanel.dataset.fromSelect = "1";
      ocrText.value = "正在识别手写内容...";
      ocrText.classList.add("ocr-loading");
      try {
        const imageDataUrl = renderStrokesToImage(selected, box);
        const recognized = await ocrFromImage(imageDataUrl);
        if (recognized && recognized.length > 0) {
          ocrText.value = recognized;
          showToast(`套索识别完成，可调用 ${agents[activeAgent].name}`);
        } else {
          ocrText.value = guessed;
          showToast(`已框选 ${selected.length} 组笔迹，可修正后调用 Agent`);
        }
      } catch {
        ocrText.value = guessed;
        showToast(`已框选 ${selected.length} 组笔迹，可修正后调用 Agent`);
      } finally {
        ocrText.classList.remove("ocr-loading");
      }
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

    function renderStrokesToImage(strokes, box) {
      const padding = 20;
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(200, (box.width + padding * 2) * scale);
      canvas.height = Math.max(60, (box.height + padding * 2) * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.translate(-box.x + padding, -box.y + padding);
      strokes.forEach(stroke => {
        if (stroke.points.length < 2) return;
        ctx.strokeStyle = "#1a1a1a";
        ctx.lineWidth = Math.max((toolStyles[stroke.tool] || toolStyles.pen).width, 2.5);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length - 1; i++) {
          const mx = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
          const my = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
          ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, mx, my);
        }
        const last = stroke.points[stroke.points.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
      });
      return canvas.toDataURL("image/png");
    }

    async function ocrFromImage(imageDataUrl) {
      try {
        const response = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl })
        });
        if (!response.ok) throw new Error(`${response.status}`);
        const data = await response.json();
        return (data.choices?.[0]?.message?.content || "").trim();
      } catch (error) {
        console.warn("OCR failed:", error.message);
        return null;
      }
    }

    function findStrokesNearPoint(point, radius = 40) {
      return strokes.filter(stroke => {
        return stroke.points.some(p => Math.hypot(p.x - point.x, p.y - point.y) < radius);
      });
    }

    function generateFallbackContent(agentKey, source, mode = "initial", parents = []) {
      const agent = agents[agentKey];
      const clean = source.replace(/\s+/g, " ").trim() || "未命名问题";
      const templates = {
        assistant: [
          "拆解核心问题为 2-3 个可独立回答的子问题，逐个分析",
          "将结论标注为「事实」「推断」「待验证」三类，避免混淆",
          "给出明确的下一步建议：优先做什么、谁来做、预期结果",
          "识别当前分析中可能遗漏的盲区或假设"
        ],
        tech: [
          "梳理实现路径：列出关键技术栈、依赖项和接口边界",
          "对比至少 2 种可行方案，给出各自的优劣和适用场景",
          "评估技术风险：性能瓶颈、安全边界、扩展性限制",
          "建议分阶段实施：MVP 范围 → 迭代计划 → 长期架构"
        ],
        exec: [
          "将目标拆解为可执行的任务清单，每项含负责人和时间盒",
          "识别关键路径和里程碑，标注依赖关系",
          "列出 3 个最大的风险点和对应的缓解措施",
          "定义完成标准：如何判断每个任务已经「做完」"
        ],
        knowledge: [
          "提炼 3-5 个核心概念并给出简洁定义",
          "为每个概念提供至少一个具体例证和反例",
          "标注概念之间的关联关系（因果、层级、对比）",
          "列出值得进一步验证的事实假设和信息缺口"
        ],
        product: [
          "从用户场景出发：谁在什么情况下需要这个功能",
          "描述核心功能的价值主张和差异化亮点",
          "划分优先级：P0 必须有 / P1 应该有 / P2 可以有",
          "给出可验证的成功指标：用户行为变化或数据指标"
        ]
      };
      const intro = mode === "graft"
        ? `基于 ${parents.length} 个节点汇聚：${clean}`
        : mode === "derive"
          ? `从选中内容继续生成：${clean}`
          : `识别手写：${clean}`;

      return `
        <p><span class="source-line">${escapeHtml(intro)}</span></p>
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
        <div class="loading-spinner"></div>
        <p style="text-align:center;color:var(--muted);font-size:12px;margin-top:8px">${agents[agentKey].name} 正在思考中…</p>
      `;
    }

    async function resolveGeneratedContent(agentKey, source, mode, parents) {
      if (!serverOnline) {
        showToast("服务未连接，使用本地模拟内容");
        return generateFallbackContent(agentKey, source, mode, parents);
      }
      try {
        const text = await callModel(agentKey, source, mode, parents);
        if (!text || text.trim().length === 0) {
          showToast(`${agents[agentKey].name} 返回了空内容，使用本地模拟`);
          return generateFallbackContent(agentKey, source, mode, parents);
        }
        return renderModelText(text, agentKey, source, mode, parents);
      } catch (error) {
        const msg = error.message.includes("fetch") || error.message.includes("Network")
          ? "网络连接失败，请检查网络后重试"
          : error.message.includes("503") || error.message.includes("502")
            ? "AI 服务暂不可用，已使用本地模拟内容"
            : `请求失败（${error.message}），已回退到本地模拟`;
        showToast(msg);
        return generateFallbackContent(agentKey, source, mode, parents);
      }
    }

    async function callModel(agentKey, source, mode, parents) {
      const context = parents.map(id => {
        const node = findNode(id);
        return node ? `${agents[node.agentKey].name}: ${node.source}` : "";
      }).filter(Boolean).join("\n");
      const agent = agents[agentKey];
      const roleDesc = agent.roleDesc || `${agent.name}，为用户提供专业分析和建议。`;
      const skillsText = (agent.skills && agent.skills.length > 0)
        ? `核心能力：${agent.skills.join("、")}。`
        : "";
      const modeDesc = mode === "derive" ? "基于已有节点继续深入分析" : mode === "graft" ? "综合多个节点的内容生成新结论" : "根据用户输入生成初始分析";
      const prompt = [
        `任务：${modeDesc}。`,
        `用户内容：${source}`,
        context ? `上游上下文：\n${context}` : "",
        "请输出结构化的节点内容：用1-2句话概括结论，再用3-5个要点展开分析或行动建议。使用中文输出。"
      ].filter(Boolean).join("\n\n");

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: `你是${agent.name}。${roleDesc} ${skillsText}你工作在可视化白板中，输出会被放在一个节点卡片里。请确保内容结构清晰、可直接使用，不要输出问候语。` },
            { role: "user", content: prompt }
          ]
        })
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `${response.status}`);
      }
      const data = await response.json();
      return data.choices?.[0]?.message?.content || "";
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
          <button class="node-delete-btn" data-action="delete" aria-label="删除节点" title="删除此节点">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 4h12M5 4V3h6v1M3 4l1 10h8l1-10"/></svg>
          </button>
        </header>
        <div class="node-body">${loadingContent(agentKey, source, mode, parents)}</div>
        <button class="connector" data-action="connect" aria-label="拉线"></button>
      `;
      uiLayer.appendChild(el);
      installNodeEvents(el);
      el.classList.add("node-loading");
      resolveGeneratedContent(agentKey, source, mode, parents).then(html => {
        const body = el.querySelector(".node-body");
        if (body) body.innerHTML = html;
        el.classList.remove("node-loading");
      }).catch(() => {
        el.classList.remove("node-loading");
        el.classList.add("node-error");
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

      // ── 钢笔在节点上绘制 ──
      el.addEventListener("pointerdown", event => {
        if (activeTool !== "pen") return;
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

      // ── 连接器拖拽（自由连接）──
      const connector = el.querySelector(".connector");
      let connDragging = false;

      connector.addEventListener("pointerdown", event => {
        event.preventDefault();
        event.stopPropagation();
        connDragging = true;
        const fromId = el.dataset.id;
        const fromNode = findNode(fromId);
        const startPos = { x: fromNode.x + fromNode.width, y: fromNode.y + 94 };
        showDragLine(startPos, { x: event.clientX, y: event.clientY });
        showToast("拖拽到另一个节点建立连接，或松手在空白处取消");

        function onMove(e) {
          if (!connDragging) return;
          updateDragLine({ x: e.clientX, y: e.clientY });
        }
        function onUp(e) {
          if (!connDragging) return;
          connDragging = false;
          hideDragLine();
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          // 检测释放位置是否在另一个节点上
          const targetNode = document.elementFromPoint(e.clientX, e.clientY)?.closest(".node");
          if (targetNode && targetNode.dataset.id !== fromId) {
            const toId = targetNode.dataset.id;
            if (!links.some(l => l.from === fromId && l.to === toId)) {
              addLink(fromId, toId);
              saveLinks();
              renderLinks();
              showToast("已建立连接箭头，点击箭头可编辑关系类型");
            } else {
              showToast("这两个节点之间已有连接");
            }
          } else if (targetNode && targetNode.dataset.id === fromId) {
            showToast("不能连接到自身");
          }
        }
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });

      el.addEventListener("click", event => {
        const action = event.target.dataset.action;
        const id = el.dataset.id;

        // ── 垃圾桶工具：删除节点 ──
        if (activeTool === "trash") {
          event.stopPropagation();
          deleteNode(id);
          return;
        }

        // ── 删除按钮 ──
        if (action === "delete" || event.target.closest("[data-action='delete']")) {
          event.stopPropagation();
          deleteNode(id);
          return;
        }

        // ── 连接工具模式：点第一个节点 → 点第二个节点 → 创建箭头 ──
        if (activeTool === "connect") {
          if (connectingFrom && connectingFrom !== id) {
            if (!links.some(l => l.from === connectingFrom && l.to === id)) {
              addLink(connectingFrom, id);
              renderLinks();
              showToast("已建立连接箭头，点击箭头可编辑关系类型");
            } else {
              showToast("这两个节点之间已有连接");
            }
            selectNode(id);
            connectingFrom = null;
            return;
          }
          selectNode(id);
          connectingFrom = id;
          showToast("已选择起点节点，点击另一个节点完成连接");
          return;
        }

        selectNode(id);

        if (connectingFrom && connectingFrom !== id && action !== "connect") {
          graftNodes([connectingFrom, id]);
          connectingFrom = null;
          return;
        }

        if (action === "connect") {
          // 点击连接器也触发拖拽提示
          startConnect(id);
        } else {
          sniffNode(id, event.clientX, event.clientY);
        }
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

    function deriveFromNode(id, agentKeyOverride) {
      const parent = findNode(id);
      const agentKey = agentKeyOverride || activeAgent;
      const childX = parent.x + 360;
      const childY = parent.y + 46;
      // 派生前清除旧选中，createNode 内部会自动选中新节点
      selectedNodeId = null;
      document.querySelectorAll(".node").forEach(el => el.classList.remove("selected"));
      createNode({
        x: childX,
        y: childY,
        agentKey,
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
      saveLinks();
      document.querySelector(`.node[data-id="${id}"]`)?.remove();
      if (selectedNodeId === id) selectedNodeId = null;
      if (connectingFrom === id) connectingFrom = null;
      renderLinks();
      hideScope();
      showToast("已剪枝：节点和相关上下文连接已移除");
    }

    function addLink(from, to, type = "derive") {
      if (!from || !to || links.some(link => link.from === from && link.to === to)) return;
      links.push({ id: `l${linkId++}`, from, to, type });
      saveLinks();
    }

    // ── 连接关系 localStorage 持久化 ──
    function saveLinks() {
      try {
        localStorage.setItem("inkscope_links", JSON.stringify(links));
      } catch { /* ignore */ }
    }

    function loadLinks() {
      try {
        const saved = localStorage.getItem("inkscope_links");
        if (saved) {
          const parsed = JSON.parse(saved);
          // 只恢复两端节点都存在的连接
          const restored = parsed.filter(l => findNode(l.from) && findNode(l.to));
          for (const l of restored) {
            if (!links.some(existing => existing.from === l.from && existing.to === l.to)) {
              links.push(l);
              if (parseInt(l.id.slice(1)) >= linkId) linkId = parseInt(l.id.slice(1)) + 1;
            }
          }
          if (restored.length > 0) renderLinks();
        }
      } catch { /* ignore */ }
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
        const typeDef = LINK_TYPES[link.type] || LINK_TYPES.derive;
        const color = agents[from.agentKey].color;
        const start = { x: from.x + from.width, y: from.y + 94 };
        const end = { x: to.x, y: to.y + 72 };
        const dx = Math.max(80, Math.abs(end.x - start.x) * .42);
        const d = `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;

        // 计算箭头中点用于标签定位
        const midX = (start.x + end.x) / 2 + dx * 0.15;
        const midY = (start.y + end.y) / 2;

        const hit = svgEl("path", { d, class: "arrow-hit", "data-link": link.id });
        const line = svgEl("path", {
          d,
          class: "arrow-path",
          "data-link": link.id,
          "marker-end": "url(#arrowHead)",
          "stroke-dasharray": typeDef.dash === "none" ? "0" : typeDef.dash,
          "stroke-width": typeDef.width,
          style: `--agent-color:${color}`
        });
        // 关系类型标签
        const label = svgEl("text", {
          x: midX, y: midY - 6,
          class: "arrow-label",
          "data-link": link.id,
          fill: "#6b757d",
          "font-size": "11",
          "text-anchor": "middle"
        });
        label.textContent = typeDef.label;

        hit.addEventListener("click", event => {
          event.stopPropagation();
          if (activeTool === "cut") {
            cutLink(link.id);
            return;
          }
          openArrowPanel(link, { x: event.clientX, y: event.clientY });
        });
        hit.addEventListener("pointerenter", event => {
          sniffLink(link.id, event.clientX, event.clientY);
        });
        hit.addEventListener("pointerleave", hideScope);
        arrowLayer.appendChild(hit);
        arrowLayer.appendChild(line);
        arrowLayer.appendChild(label);
      }
    }

    function cutLink(id) {
      const line = arrowLayer.querySelector(`.arrow-path[data-link="${id}"]`);
      line?.classList.add("arrow-cut");
      links = links.filter(link => link.id !== id);
      saveLinks();
      setTimeout(renderLinks, 180);
      closeArrowPanel();
      showToast("已删除连接箭头");
    }

    // ── 箭头编辑面板 ──
    let editingLinkId = null;

    function openArrowPanel(link, pos) {
      editingLinkId = link.id;
      const panel = document.getElementById("arrowEditPanel");
      const typeSelect = document.getElementById("arrowTypeSelect");
      typeSelect.value = link.type || "derive";
      panel.style.display = "block";
      panel.style.left = `${Math.min(pos.x, window.innerWidth - 220)}px`;
      panel.style.top = `${Math.max(80, pos.y - 20)}px`;
    }

    function closeArrowPanel() {
      editingLinkId = null;
      document.getElementById("arrowEditPanel").style.display = "none";
    }

    function updateLinkType() {
      if (!editingLinkId) return;
      const newType = document.getElementById("arrowTypeSelect").value;
      const link = links.find(l => l.id === editingLinkId);
      if (link) {
        link.type = newType;
        saveLinks();
        renderLinks();
        showToast(`箭头关系已更新为：${LINK_TYPES[newType].label}`);
      }
    }

    function reverseLinkDirection() {
      if (!editingLinkId) return;
      const link = links.find(l => l.id === editingLinkId);
      if (link) {
        [link.from, link.to] = [link.to, link.from];
        saveLinks();
        renderLinks();
        showToast("箭头方向已反转");
      }
    }

    document.getElementById("arrowTypeSelect").addEventListener("change", updateLinkType);
    document.getElementById("reverseArrowBtn").addEventListener("click", reverseLinkDirection);
    document.getElementById("deleteArrowBtn").addEventListener("click", () => {
      if (editingLinkId) cutLink(editingLinkId);
    });
    document.getElementById("closeArrowPanel").addEventListener("click", closeArrowPanel);

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

    // ── Agent 拖拽连接 ──
    const dragLayer = document.getElementById("dragLayer");

    function showDragLine(from, to) {
      dragLayer.innerHTML = "";
      const line = svgEl("path", {
        d: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
        class: "drag-line"
      });
      const dot = svgEl("circle", { cx: to.x, cy: to.y, r: 5, class: "drag-dot" });
      dragLayer.appendChild(line);
      dragLayer.appendChild(dot);
    }

    function updateDragLine(to) {
      const line = dragLayer.querySelector(".drag-line");
      const dot = dragLayer.querySelector(".drag-dot");
      if (!line || !dot) return;
      const fromMatch = line.getAttribute("d").match(/M\s+([\d.]+)\s+([\d.]+)/);
      if (!fromMatch) return;
      const fromX = parseFloat(fromMatch[1]);
      const fromY = parseFloat(fromMatch[2]);
      line.setAttribute("d", `M ${fromX} ${fromY} L ${to.x} ${to.y}`);
      dot.setAttribute("cx", to.x);
      dot.setAttribute("cy", to.y);
    }

    function hideDragLine() {
      dragLayer.innerHTML = "";
    }

    async function triggerOcrAndGenerate(strokes, box, agentKey) {
      let recognized = inferTextFromInk(strokes, box);
      if (serverOnline) {
        try {
          const imageDataUrl = renderStrokesToImage(strokes, box);
          const result = await ocrFromImage(imageDataUrl);
          if (result && result.length > 0) recognized = result;
        } catch { /* fallback */ }
      }
      createNode({
        x: box.x + box.width + 24,
        y: box.y,
        agentKey,
        source: recognized,
        mode: "initial",
        parents: []
      });
    }

    document.querySelectorAll(".tool[data-tool]").forEach(button => {
      button.addEventListener("click", () => setTool(button.dataset.tool));
    });

    window.addEventListener("pointermove", event => {
      if (!agentDragAgent) return;
      if (!agentDragStarted) {
        const dx = event.clientX - agentDragStart.x;
        const dy = event.clientY - agentDragStart.y;
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        agentDragStarted = true;
        setAgent(agentDragAgent);
        showDragLine(agentDragStart, { x: event.clientX, y: event.clientY });
        showToast(`拖拽 ${agents[agentDragAgent].name} 到手写区域释放，自动识别并生成`);
      }
      updateDragLine({ x: event.clientX, y: event.clientY });
    });

    window.addEventListener("pointerup", event => {
      if (!agentDragAgent) return;
      if (agentDragStarted) {
        const point = pointFromEvent(event);
        const nearby = findStrokesNearPoint(point, 48);
        if (nearby.length > 0) {
          const box = bbox(nearby.flatMap(s => s.points));
          triggerOcrAndGenerate(nearby, box, agentDragAgent);
          showToast(`${agents[agentDragAgent].name} 正在识别手写并生成节点`);
        } else {
          showToast("释放位置没有手写内容，请拖拽到手写笔迹上方释放");
        }
      }
      hideDragLine();
      agentDragAgent = null;
      agentDragStart = null;
      agentDragStarted = false;
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

    function closeLassoPanel() {
      lassoPanel.style.display = "none";
      lastLassoBox = null;
      // 仅当面板由套索工具打开时才清除套索选择路径
      if (lassoPanel.dataset.fromSelect === "1") {
        const last = lassoSelections.pop();
        if (last) last.path.remove();
      }
      lassoPanel.dataset.fromSelect = "";
      lassoPanel.dataset.nodeId = "";
    }

    document.getElementById("generateFromLasso").addEventListener("click", () => {
      if (!lastLassoBox) return;
      const parentNodeId = lassoPanel.dataset.nodeId || "";
      const parent = parentNodeId ? findNode(parentNodeId) : null;
      // 清除来源节点上的手写笔迹（如果是从节点上识别的手写内容）
      if (parent && parent.nodeStrokes && parent.nodeStrokes.length > 0) {
        parent.nodeStrokes.forEach(s => s.path?.remove());
        parent.nodeStrokes = [];
      }
      createNode({
        x: parent ? parent.x + 340 : lastLassoBox.x + lastLassoBox.width + 24,
        y: parent ? parent.y + 36 : lastLassoBox.y,
        agentKey: activeAgent,
        source: ocrText.value,
        mode: parent ? "derive" : "initial",
        parents: parent ? [parentNodeId] : []
      });
      closeLassoPanel();
    });

    document.getElementById("cancelLasso").addEventListener("click", closeLassoPanel);

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
      const isOpen = settingsSheet.style.display === "block";
      settingsSheet.style.display = isOpen ? "none" : "block";
      if (!isOpen) checkHealth();
    });

    // ── 一键重置示例画布 ──
    function resetToDemo() {
      // 清除所有节点
      document.querySelectorAll(".node").forEach(el => el.remove());
      nodes = [];
      selectedNodeId = null;
      connectingFrom = null;
      nodeId = 1;
      // 清除所有连接
      links = [];
      linkId = 1;
      saveLinks();
      arrowLayer.innerHTML = "";
      // 清除手写笔迹
      strokes.forEach(s => s.path.remove());
      strokes = [];
      lassoSelections.forEach(s => s.path?.remove());
      lassoSelections = [];
      lassoPanel.style.display = "none";
      lastLassoBox = null;
      // 重置平移
      resetView();
      // 重新播种示例
      seedDemo();
      loadLinks();
      closeArrowPanel();
      document.getElementById("agentEditPanel").style.display = "none";
      document.getElementById("textSelectPopup").style.display = "none";
      showToast("画布已重置为示例状态");
    }

    const resetBtn = document.getElementById("resetDemoBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", resetToDemo);
    }

    // ── 新手引导 ──
    function showOnboarding() {
      const seen = localStorage.getItem("inkscope_onboarding_seen");
      if (seen) return;
      document.getElementById("onboardingOverlay").style.display = "flex";
    }

    document.getElementById("closeOnboarding").addEventListener("click", () => {
      document.getElementById("onboardingOverlay").style.display = "none";
      localStorage.setItem("inkscope_onboarding_seen", "1");
      showToast("开始使用吧！底部选钢笔书写，套索框选后点左侧 Agent");
    });

    const undoEl = document.getElementById("undoBtn");
    if (undoEl) {
      undoEl.addEventListener("click", () => {
        const stroke = strokes.pop();
        if (stroke) stroke.path.remove();
      });
    }

    const clearEl = document.getElementById("clearBtn");
    if (clearEl) {
      clearEl.addEventListener("click", () => {
        strokes.forEach(stroke => stroke.path.remove());
        lassoSelections.forEach(selection => selection.path.remove());
        strokes = [];
        lassoSelections = [];
        lassoPanel.style.display = "none";
        lastLassoBox = null;
        lassoPanel.dataset.nodeId = "";
        showToast("已清空手写层，AI 节点和上下文连接保留");
      });
    }

    // ── 内容框文字选中 → 二次生成 ──
    let textSelectSourceNodeId = null;
    let textSelectSourceText = "";

    function renderTextSelectAgents() {
      const list = document.getElementById("textSelectAgentList");
      if (!list) return;
      list.innerHTML = Object.entries(agents).map(([key, agent]) => `
        <button class="text-select-agent-item" data-agent="${key}" style="--agent-color: ${agent.color}">
          <span class="agent-face">${agent.short}</span>
          <span>${agent.name}</span>
        </button>
      `).join("");
      document.querySelectorAll(".text-select-agent-item").forEach(btn => {
        btn.addEventListener("click", () => {
          const agentKey = btn.dataset.agent;
          document.getElementById("textSelectPopup").style.display = "none";
          if (!textSelectSourceNodeId) return;
          createNode({
            x: findNode(textSelectSourceNodeId).x + 360,
            y: findNode(textSelectSourceNodeId).y + 46,
            agentKey,
            source: textSelectSourceText,
            mode: "derive",
            parents: [textSelectSourceNodeId]
          });
          showToast(`${agents[agentKey].name} 正在基于选中文字生成`);
          textSelectSourceNodeId = null;
          textSelectSourceText = "";
        });
      });
    }

    document.addEventListener("mouseup", event => {
      // 延迟检查，等浏览器完成选中
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          // 没有有效选中文字，不处理
          return;
        }
        const selectedText = sel.toString().trim();
        if (selectedText.length < 2) return;

        // 检查选区是否在某个节点内部
        const anchorNode = sel.anchorNode;
        const nodeEl = anchorNode?.parentElement?.closest?.(".node");
        if (!nodeEl) return;
        const nodeId = nodeEl.dataset.id;
        if (!nodeId) return;

        // 确保选区在 node-body 内部
        if (!nodeEl.querySelector(".node-body")?.contains(anchorNode)) return;

        textSelectSourceNodeId = nodeId;
        textSelectSourceText = selectedText;

        // 显示 Agent 选择浮窗
        const popup = document.getElementById("textSelectPopup");
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        popup.style.display = "block";
        popup.style.left = `${Math.min(rect.left + rect.width / 2 - 100, window.innerWidth - 230)}px`;
        popup.style.top = `${Math.max(80, rect.bottom + 8)}px`;
        renderTextSelectAgents();
      }, 20);
    });

    document.getElementById("cancelTextSelect").addEventListener("click", () => {
      document.getElementById("textSelectPopup").style.display = "none";
      textSelectSourceNodeId = null;
      textSelectSourceText = "";
      window.getSelection().removeAllRanges();
    });

    // 点击空白处关闭
    document.addEventListener("pointerdown", event => {
      const popup = document.getElementById("textSelectPopup");
      if (popup.style.display === "block" && !popup.contains(event.target) && !event.target.closest(".node-body")) {
        popup.style.display = "none";
      }
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

    renderAgentList();
    loadUserSettings();
    checkHealth();
    updateReadout();
    seedDemo();
    loadLinks(); // 恢复之前保存的连接关系
    showOnboarding(); // 首次访问显示引导
    showToast("用钢笔写字 → 套索框选 → 点击 Agent。拖拽节点右侧连接点可自由连线。");
