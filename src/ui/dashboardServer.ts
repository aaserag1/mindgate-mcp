/**
 * MindGate Local Web Dashboard Server (v1.3.0)
 *
 * Provides a lightweight, zero-dependency, local-only HTTP dashboard for
 * visually inspecting, searching, editing, deprecating, and compacting
 * project memories and developer preferences.
 *
 * Security: Strictly binds to 127.0.0.1 (loopback interface only). Never
 * listens on external network interfaces.
 */

import http from "node:http";
import { MindGateStore, MemoryCategory, MemoryStatus } from "../db/memoryStore.js";

function parseJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        // 1MB safety cap
        req.destroy();
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(body);
        if (typeof parsed === "object" && parsed !== null) {
          resolve(parsed as Record<string, unknown>);
        } else {
          resolve({});
        }
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
    "Access-Control-Allow-Origin": "http://127.0.0.1",
    "Cache-Control": "no-store",
  });
  res.end(json);
}

function sendHtml(res: http.ServerResponse, html: string): void {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    "Cache-Control": "no-store",
  });
  res.end(html);
}

export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🧠 MindGate (بوابة العقل) — Dashboard</title>
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --text-muted: #8b949e;
      --text-heading: #f0f6fc;
      --primary: #58a6ff;
      --primary-hover: #1f6feb;
      --success: #238636;
      --danger: #da3633;
      --warning: #d29922;
      --badge-arch: #8957e5;
      --badge-dec: #1f6feb;
      --badge-bug: #f85149;
      --badge-conv: #3fb950;
      --badge-ctx: #db61a2;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    [data-theme="light"] {
      --bg: #f6f8fa;
      --card-bg: #ffffff;
      --border: #d0d7de;
      --text: #24292f;
      --text-muted: #57606a;
      --text-heading: #1f2328;
      --primary: #0969da;
      --primary-hover: #0550ae;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-family);
      line-height: 1.5;
      padding-bottom: 60px;
    }
    header {
      background-color: var(--card-bg);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .logo-area { display: flex; align-items: center; gap: 12px; }
    .logo-area h1 { font-size: 1.25rem; color: var(--text-heading); font-weight: 700; }
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 12px;
      border: 1px solid transparent;
    }
    .badge-status { background: #23863622; color: #3fb950; border-color: #23863666; }
    .controls { display: flex; gap: 8px; align-items: center; }
    button, .btn {
      background: var(--card-bg);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    button:hover, .btn:hover { background: var(--border); color: var(--text-heading); }
    button.btn-primary { background: var(--primary); color: #ffffff; border-color: transparent; }
    button.btn-primary:hover { background: var(--primary-hover); }
    button.btn-danger { background: var(--danger); color: #ffffff; border-color: transparent; }
    .container { max-width: 1200px; margin: 24px auto; padding: 0 16px; }
    .nav-tabs { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
    .tab-btn { background: none; border: none; padding: 8px 16px; border-radius: 6px; color: var(--text-muted); cursor: pointer; font-size: 0.95rem; }
    .tab-btn.active { background: var(--border); color: var(--text-heading); font-weight: 600; }
    .workspace-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; }
    .ws-pill { background: var(--card-bg); border: 1px solid var(--border); padding: 4px 12px; border-radius: 16px; cursor: pointer; font-size: 0.85rem; }
    .ws-pill.active { background: var(--primary); color: #fff; border-color: transparent; }
    .search-box { display: flex; gap: 8px; margin-bottom: 20px; }
    .search-box input {
      flex: 1;
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 0.95rem;
    }
    .search-box input:focus { outline: none; border-color: var(--primary); }
    .filter-group { display: flex; gap: 8px; }
    .filter-group select {
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.85rem;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      position: relative;
    }
    .card.superseded { opacity: 0.65; border-style: dashed; }
    .card.deprecated { opacity: 0.5; border-color: var(--danger); }
    .card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    .card-title { font-size: 1.05rem; font-weight: 600; color: var(--text-heading); }
    .cat-badge { font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; font-weight: 600; color: #ffffff; }
    .cat-architecture { background: var(--badge-arch); }
    .cat-decision { background: var(--badge-dec); }
    .cat-bugfix { background: var(--badge-bug); }
    .cat-convention { background: var(--badge-conv); }
    .cat-context { background: var(--badge-ctx); }
    .status-badge { font-size: 0.7rem; padding: 2px 6px; border-radius: 8px; }
    .status-active { background: #23863633; color: #3fb950; }
    .status-superseded { background: #d2992233; color: #d29922; }
    .status-deprecated { background: #da363333; color: #f85149; }
    .card-body { font-size: 0.875rem; color: var(--text); white-space: pre-wrap; word-break: break-word; max-height: 180px; overflow-y: auto; }
    .card-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 10px; margin-top: auto; font-size: 0.75rem; color: var(--text-muted); }
    .card-actions { display: flex; gap: 6px; }
    .action-btn { padding: 4px 8px; font-size: 0.75rem; border-radius: 4px; }
    .modal-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7); display: none; justify-content: center; align-items: center; z-index: 1000;
    }
    .modal { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; width: 90%; max-width: 550px; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-group label { font-size: 0.85rem; font-weight: 600; color: var(--text-heading); }
    .form-group input, .form-group textarea, .form-group select {
      background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 8px 10px; border-radius: 6px; font-family: inherit;
    }
    .empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
  </style>
</head>
<body>
  <header>
    <div class="logo-area">
      <h1>🧠 MindGate (بوابة العقل)</h1>
      <span class="badge badge-status">v1.3.0 Active</span>
      <span class="badge" style="background:#8957e522;color:#d2a8ff;border-color:#8957e566;">Node2Shell Shield Active</span>
    </div>
    <div class="controls">
      <button onclick="toggleLang()" id="langBtn">🌐 English</button>
      <button onclick="toggleTheme()" id="themeBtn">🌓 Theme</button>
      <button class="btn btn-primary" onclick="openNewModal()">➕ <span id="lblAdd">إضافة قرار / ذكرى</span></button>
      <button onclick="exportSnapshot()">💾 <span id="lblExport">تصدير Snapshot</span></button>
    </div>
  </header>

  <div class="container">
    <div class="nav-tabs">
      <button class="tab-btn active" onclick="switchTab('memories')" id="tabMem">📌 الذكريات والقرارات</button>
      <button class="tab-btn" onclick="switchTab('sessions')" id="tabSes">🔄 سجل تسليم الجلسات (Handoffs)</button>
      <button class="tab-btn" onclick="switchTab('preferences')" id="tabPref">⚙️ تفضيلات المطور العامة</button>
    </div>

    <!-- TAB 1: MEMORIES -->
    <div id="view-memories">
      <div class="workspace-bar" id="wsBar"></div>

      <div class="search-box">
        <input type="text" id="searchInput" placeholder="ابحث بالكلمات المفتاحية عبر محرك FTS5 BM25..." oninput="debounceSearch()">
        <div class="filter-group">
          <select id="catFilter" onchange="loadMemories()">
            <option value="">جميع التصنيفات</option>
            <option value="architecture">معمارية (architecture)</option>
            <option value="decision">قرار (decision)</option>
            <option value="bugfix">حل مشكلة (bugfix)</option>
            <option value="convention">اتفاقية كود (convention)</option>
            <option value="context">سياق (context)</option>
          </select>
          <select id="statusFilter" onchange="loadMemories()">
            <option value="active">النشطة فقط (Active)</option>
            <option value="all">الكل (شامل الملغى)</option>
            <option value="superseded">المستبدلة فقط</option>
            <option value="deprecated">المعطلة فقط</option>
          </select>
        </div>
      </div>

      <div class="grid" id="memoriesGrid"></div>
    </div>

    <!-- TAB 2: SESSIONS -->
    <div id="view-sessions" style="display:none;">
      <div style="display:flex; justify-content:space-between; margin-bottom:16px; align-items:center;">
        <h2 id="lblSesTitle" style="font-size:1.1rem; color:var(--text-heading);">سجل جلسات تسليم السياق</h2>
        <button class="btn btn-primary" onclick="compactSessions()">🗜️ ضغط وتلخيص الجلسات القديمة (Compact)</button>
      </div>
      <div id="sessionsList" style="display:flex; flex-direction:column; gap:12px;"></div>
    </div>

    <!-- TAB 3: PREFERENCES -->
    <div id="view-preferences" style="display:none;">
      <div style="display:flex; justify-content:space-between; margin-bottom:16px; align-items:center;">
        <h2 style="font-size:1.1rem; color:var(--text-heading);">تفضيلات المطور وقواعد الكود العامة</h2>
        <button class="btn btn-primary" onclick="openPrefModal()">➕ إضافة تفضيل جديد</button>
      </div>
      <div id="prefList" class="grid"></div>
    </div>
  </div>

  <!-- ADD / EDIT MEMORY MODAL -->
  <div class="modal-overlay" id="memoryModal">
    <div class="modal">
      <h3 id="modalTitle" style="color:var(--text-heading);">إضافة قرار معماري أو سياق جديد</h3>
      <input type="hidden" id="editId">
      <div class="form-group">
        <label>مساحة العمل (Workspace):</label>
        <input type="text" id="mWorkspace" value="global">
      </div>
      <div class="form-group">
        <label>التصنيف:</label>
        <select id="mCategory">
          <option value="architecture">معمارية (architecture)</option>
          <option value="decision" selected>قرار (decision)</option>
          <option value="bugfix">حل مشكلة (bugfix)</option>
          <option value="convention">اتفاقية كود (convention)</option>
          <option value="context">سياق (context)</option>
        </select>
      </div>
      <div class="form-group">
        <label>العنوان:</label>
        <input type="text" id="mTitle" placeholder="مثال: اعتماد نمط Clean Architecture">
      </div>
      <div class="form-group">
        <label>المحتوى والشرح:</label>
        <textarea id="mContent" rows="5" placeholder="التفاصيل والقيود والحل المعتمد..."></textarea>
      </div>
      <div class="form-group">
        <label>الوسوم (مفصولة بفاصلة):</label>
        <input type="text" id="mTags" placeholder="api, sqlite, auth">
      </div>
      <div class="form-group">
        <label>يلغي قرار سابق (Supersedes ID - اختياري):</label>
        <input type="number" id="mSupersedes" placeholder="رقم المعرف ID للقرار السابق الذي تم إلغاؤه">
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
        <button onclick="closeModal('memoryModal')">إلغاء</button>
        <button class="btn btn-primary" onclick="saveMemory()">حفظ في الذاكرة</button>
      </div>
    </div>
  </div>

  <script>
    let currentWorkspace = 'all';
    let currentTab = 'memories';
    let isRtl = true;
    let searchTimer = null;

    function toggleTheme() {
      const isLight = document.body.getAttribute('data-theme') === 'light';
      document.body.setAttribute('data-theme', isLight ? 'dark' : 'light');
    }

    function toggleLang() {
      isRtl = !isRtl;
      document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
      document.documentElement.lang = isRtl ? 'ar' : 'en';
      document.getElementById('langBtn').innerText = isRtl ? '🌐 English' : '🌐 العربية';
    }

    function switchTab(tab) {
      currentTab = tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('view-memories').style.display = tab === 'memories' ? 'block' : 'none';
      document.getElementById('view-sessions').style.display = tab === 'sessions' ? 'block' : 'none';
      document.getElementById('view-preferences').style.display = tab === 'preferences' ? 'block' : 'none';
      if (tab === 'memories') { document.getElementById('tabMem').classList.add('active'); loadMemories(); }
      if (tab === 'sessions') { document.getElementById('tabSes').classList.add('active'); loadSessions(); }
      if (tab === 'preferences') { document.getElementById('tabPref').classList.add('active'); loadPreferences(); }
    }

    async function loadWorkspaces() {
      const res = await fetch('/api/workspaces');
      const wsList = await res.json();
      const bar = document.getElementById('wsBar');
      bar.innerHTML = '<span class="ws-pill ' + (currentWorkspace === 'all' ? 'active' : '') + '" onclick="selectWorkspace(\\'all\\')">الكل (All)</span>';
      wsList.forEach(w => {
        bar.innerHTML += '<span class="ws-pill ' + (currentWorkspace === w.workspace ? 'active' : '') + '" onclick="selectWorkspace(\\'' + w.workspace + '\\')">' + w.workspace + ' (' + w.memory_count + ')</span>';
      });
    }

    function selectWorkspace(ws) {
      currentWorkspace = ws;
      loadWorkspaces();
      loadMemories();
    }

    async function loadMemories() {
      const q = document.getElementById('searchInput').value;
      const cat = document.getElementById('catFilter').value;
      const status = document.getElementById('statusFilter').value;
      const wsParam = currentWorkspace !== 'all' ? currentWorkspace : '';
      const params = new URLSearchParams({ workspace: wsParam, q, category: cat, status });
      const res = await fetch('/api/memories?' + params.toString());
      const data = await res.json();
      const grid = document.getElementById('memoriesGrid');
      grid.innerHTML = '';
      if (!data.memories || data.memories.length === 0) {
        grid.innerHTML = '<div class="empty-state">لا توجد ذكريات تطابق هذا البحث.</div>';
        return;
      }
      data.memories.forEach(m => {
        const supersededNote = m.supersedes ? '<div style="font-size:0.75rem; color:var(--warning)">⚡ يستبدل القرار #' + m.supersedes + '</div>' : '';
        const supersededByNote = m.superseded_by ? '<div style="font-size:0.75rem; color:var(--text-muted)">تم استبداله بالقرار #' + m.superseded_by + '</div>' : '';
        grid.innerHTML += \`
          <div class="card \${m.status}">
            <div class="card-header">
              <span class="card-title">#\${m.id} \${m.title}</span>
              <span class="cat-badge cat-\${m.category}">\${m.category}</span>
            </div>
            <div>
              <span class="status-badge status-\${m.status}">\${m.status}</span>
              \${supersededNote}
              \${supersededByNote}
            </div>
            <div class="card-body">\${m.content}</div>
            <div class="card-footer">
              <div>\${m.workspace} • \${m.created_at}</div>
              <div class="card-actions">
                <button class="action-btn" onclick="deprecateMem(\${m.id})">تعطيل</button>
                <button class="action-btn btn-danger" onclick="deleteMem(\${m.id})">حذف</button>
              </div>
            </div>
          </div>
        \`;
      });
    }

    function debounceSearch() {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadMemories, 300);
    }

    async function deleteMem(id) {
      if (!confirm('هل أنت متأكد من حذف الذكرى #' + id + '؟')) return;
      await fetch('/api/memories/' + id, { method: 'DELETE' });
      loadMemories();
      loadWorkspaces();
    }

    async function deprecateMem(id) {
      const reason = prompt('سبب التعطيل (اختياري):');
      if (reason === null) return;
      await fetch('/api/memories/' + id + '/deprecate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      loadMemories();
    }

    function openNewModal() {
      document.getElementById('editId').value = '';
      document.getElementById('mTitle').value = '';
      document.getElementById('mContent').value = '';
      document.getElementById('mTags').value = '';
      document.getElementById('mSupersedes').value = '';
      if (currentWorkspace !== 'all') document.getElementById('mWorkspace').value = currentWorkspace;
      document.getElementById('memoryModal').style.display = 'flex';
    }

    function closeModal(id) { document.getElementById(id).style.display = 'none'; }

    async function saveMemory() {
      const workspace = document.getElementById('mWorkspace').value.trim() || 'global';
      const category = document.getElementById('mCategory').value;
      const title = document.getElementById('mTitle').value.trim();
      const content = document.getElementById('mContent').value.trim();
      const tags = document.getElementById('mTags').value.split(',').map(t => t.trim()).filter(Boolean);
      const supersedesRaw = document.getElementById('mSupersedes').value;
      const supersedes = supersedesRaw ? Number(supersedesRaw) : undefined;

      if (!title || !content) { alert('العنوان والمحتوى حقول إلزامية.'); return; }

      await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, category, title, content, tags, supersedes, source_agent: 'mindgate-ui' })
      });
      closeModal('memoryModal');
      loadMemories();
      loadWorkspaces();
    }

    async function loadSessions() {
      const wsParam = currentWorkspace !== 'all' ? currentWorkspace : '';
      const res = await fetch('/api/sessions?workspace=' + wsParam);
      const sessions = await res.json();
      const list = document.getElementById('sessionsList');
      list.innerHTML = '';
      if (!sessions || sessions.length === 0) {
        list.innerHTML = '<div class="empty-state">لا توجد جلسات مسجلة بعد.</div>';
        return;
      }
      sessions.forEach(s => {
        list.innerHTML += \`
          <div class="card">
            <div class="card-header">
              <span class="card-title">جلسة #\${s.id} (\${s.workspace})</span>
              <span class="badge" style="background:#58a6ff22; color:#58a6ff;">\${s.source_agent}</span>
            </div>
            <div class="card-body">\${s.summary}</div>
            \${s.active_files ? '<div style="font-size:0.8rem; color:var(--text-muted)">ملفات نشطة: <code>' + s.active_files + '</code></div>' : ''}
            <div class="card-footer"><div>\${s.created_at}</div></div>
          </div>
        \`;
      });
    }

    async function compactSessions() {
      const ws = currentWorkspace !== 'all' ? currentWorkspace : prompt('أدخل اسم الـ Workspace المراد ضغط جلساته:');
      if (!ws) return;
      const res = await fetch('/api/sessions/compact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: ws, max_sessions_to_keep: 5 })
      });
      const data = await res.json();
      alert(data.message);
      loadSessions();
    }

    async function loadPreferences() {
      const res = await fetch('/api/preferences');
      const prefs = await res.json();
      const list = document.getElementById('prefList');
      list.innerHTML = '';
      prefs.forEach(p => {
        list.innerHTML += \`
          <div class="card">
            <div class="card-header">
              <span class="card-title">\${p.key}</span>
              <span class="badge" style="background:#23863622; color:#3fb950;">\${p.category}</span>
            </div>
            <div class="card-body">\${p.value}</div>
            <div class="card-footer"><div>محدث: \${p.updated_at}</div></div>
          </div>
        \`;
      });
    }

    function exportSnapshot() {
      const wsParam = currentWorkspace !== 'all' ? currentWorkspace : '';
      window.open('/api/export?workspace=' + wsParam, '_blank');
    }

    // Init
    loadWorkspaces();
    loadMemories();
  </script>
</body>
</html>`;
}

export function startDashboardServer(options: {
  port?: number;
  store?: MindGateStore;
} = {}): Promise<{
  server: http.Server;
  port: number;
  url: string;
  close: () => Promise<void>;
}> {
  const store = options.store || new MindGateStore();
  const desiredPort = options.port || 4242;

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = new URL(req.url || "/", "http://127.0.0.1");
        const pathname = parsedUrl.pathname || "/";
        const method = req.method || "GET";

        // 1. Dashboard UI
        if (pathname === "/" && method === "GET") {
          sendHtml(res, getDashboardHtml());
          return;
        }

        // 2. Workspaces
        if (pathname === "/api/workspaces" && method === "GET") {
          const workspaces = store.listWorkspaces();
          sendJson(res, 200, workspaces);
          return;
        }

        // 3. Memories API
        if (pathname === "/api/memories" && method === "GET") {
          const workspace = parsedUrl.searchParams.get("workspace") || undefined;
          const query = parsedUrl.searchParams.get("q") || undefined;
          const category = (parsedUrl.searchParams.get("category") as MemoryCategory) || undefined;
          const status = (parsedUrl.searchParams.get("status") as MemoryStatus | "all") || "all";
          const result = store.recallContext({
            workspace,
            query,
            category,
            status,
            includeGlobal: !workspace || workspace === "global",
            limit: 50,
          });
          sendJson(res, 200, result);
          return;
        }

        if (pathname === "/api/memories" && method === "POST") {
          const body = await parseJsonBody(req);
          const { record, redactions } = store.rememberDecision({
            workspace: typeof body.workspace === "string" ? body.workspace : undefined,
            category: typeof body.category === "string" ? (body.category as MemoryCategory) : undefined,
            title: String(body.title || ""),
            content: String(body.content || ""),
            tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
            sourceAgent: typeof body.source_agent === "string" ? body.source_agent : "mindgate-ui",
            supersedes: typeof body.supersedes === "number" ? body.supersedes : undefined,
          });
          sendJson(res, 201, { status: "created", record, redactions });
          return;
        }

        // 4. Memory by ID (deprecate, delete)
        const deprecateMatch = pathname.match(/^\/api\/memories\/(\d+)\/deprecate$/);
        if (deprecateMatch && method === "POST") {
          const id = parseInt(deprecateMatch[1], 10);
          const body = await parseJsonBody(req);
          const reason = typeof body.reason === "string" ? body.reason : undefined;
          const record = store.deprecateMemory(id, reason);
          if (record) {
            sendJson(res, 200, { status: "deprecated", record });
          } else {
            sendJson(res, 404, { error: "Memory not found." });
          }
          return;
        }

        const memoryIdMatch = pathname.match(/^\/api\/memories\/(\d+)$/);
        if (memoryIdMatch && method === "DELETE") {
          const id = parseInt(memoryIdMatch[1], 10);
          const deleted = store.deleteMemory(id);
          sendJson(res, deleted ? 200 : 404, { deleted, id });
          return;
        }

        // 5. Sessions API
        if (pathname === "/api/sessions" && method === "GET") {
          const workspace = parsedUrl.searchParams.get("workspace") || undefined;
          const sessions = store.getSessions({ workspace, limit: 30 });
          sendJson(res, 200, sessions);
          return;
        }

        if (pathname === "/api/sessions/compact" && method === "POST") {
          const body = await parseJsonBody(req);
          const workspace = typeof body.workspace === "string" ? body.workspace : undefined;
          const maxKeep = typeof body.max_sessions_to_keep === "number" ? body.max_sessions_to_keep : 5;
          const result = store.compactMemories({ workspace, maxSessionsToKeep: maxKeep });
          sendJson(res, 200, result);
          return;
        }

        // 6. Preferences API
        if (pathname === "/api/preferences" && method === "GET") {
          const prefs = store.getUserPreferences();
          sendJson(res, 200, prefs);
          return;
        }

        if (pathname === "/api/preferences" && method === "POST") {
          const body = await parseJsonBody(req);
          const { record, redactions } = store.setUserPreference(
            String(body.key || ""),
            String(body.value || ""),
            typeof body.category === "string" ? body.category : "coding-style"
          );
          sendJson(res, 200, { status: "saved", record, redactions });
          return;
        }

        // 7. Export Snapshot
        if (pathname === "/api/export" && method === "GET") {
          const workspace = parsedUrl.searchParams.get("workspace") || undefined;
          const snapshot = store.exportSnapshot(workspace);
          const json = JSON.stringify(snapshot, null, 2);
          const filename = `mindgate-snapshot-${workspace || "all"}-${Date.now()}.json`;
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Content-Length": Buffer.byteLength(json),
          });
          res.end(json);
          return;
        }

        sendJson(res, 404, { error: "Not Found" });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        sendJson(res, 500, { error: errorMsg });
      }
    });

    server.on("error", reject);

    // Strictly bind to 127.0.0.1 for maximum local security
    server.listen(desiredPort, "127.0.0.1", () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : desiredPort;
      const dashboardUrl = `http://127.0.0.1:${actualPort}`;
      resolve({
        server,
        port: actualPort,
        url: dashboardUrl,
        close: () =>
          new Promise((resClose) => {
            server.close(() => resClose());
          }),
      });
    });
  });
}
