# 🧠 بوابة العقل — MindGate MCP (`v1.1.0`)

[![CI](https://github.com/aaserag1/mindgate-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/aaserag1/mindgate-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](./LICENSE)
[![Security: Node2Shell Hardened](https://img.shields.io/badge/Security-Node2Shell%20Hardened-06b6d4.svg)](./SECURITY.md)
[![Version: 1.1.0](https://img.shields.io/badge/MCP-v1.1.0-8b5cf6.svg)](https://github.com/aaserag1/mindgate-mcp)

**خادم ذاكرة محلي فائق السرعة ومحصّن أمنياً لوكلاء الذكاء الاصطناعي عبر بروتوكول سياق النموذج (MCP).**

[🇬🇧 Read in English](./README.md)

---

## 💡 لماذا "بوابة العقل" (MindGate MCP)؟

يعاني مطورو البرمجيات عند استخدام وكلاء الذكاء الاصطناعي (مثل **Antigravity**، و**Cursor**، و**Claude Desktop**، و**Windsurf**، و**Cline**) من مشكلتين رئيسيتين:

1. **فقدان الذاكرة بين الجلسات (Context Amnesia):** في كل جلسة جديدة، ينسى الوكيل المعمارية البرمجية، القرارات السابقة، تفضيلاتك في كتابة الكود، والأخطاء التي تم إصلاحها بالأمس.
2. **ثغرات الحقن الموجه وتنفيذ الأوامر (`Node2Shell` / Prompt Injection):** خوادم MCP التقليدية قد تقوم بتخزين أو استرجاع نصوص ملغمة تؤدي عند قراءتها بواسطة الوكيل إلى تنفيذ أوامر خطيرة على جهاز المطور أو تسريب مفاتيح الأسرار (`API Keys` / `.env`).

**بوابة العقل (MindGate MCP)** تحل المشكلتين معاً في خادم محلي واحد (Zero-Cloud):
- 🗄️ **ذاكرة محلية دائمة فائقة السرعة (SQLite + FTS5 BM25):** تخزين واسترجاع فوري للقرارات المعمارية، إصلاحات الأخطاء، تفضيلات المطور، وملخصات تسليم الجلسات (Session Handoffs).
- 🔄 **توليد تلقائي لملفات قواعد المشروع (`AGENTS.md` / `.cursorrules` / `CLAUDE.md`) — جديد في `v1.1.0`:** يجمع قراراتك المعمارية وتفضيلاتك وإصلاحات الأخطاء في ملف قواعد موحد يقرأه أي وكيل تلقائياً فور فتح المشروع.
- ✏️ **تحديث الذكريات في مكانها (`update_memory`) والنسخ الاحتياطي المحمول (`export_memory_snapshot`) — جديد في `v1.1.0`:** عدّل أي قرار معماري دون فقدان المعرّف (`ID`)، وصدّر أو استورد ذاكرة مشروعك بالكامل بضغطة واحدة.
- 🛡️ **درع الحماية المدمج (Node2Shell Security Guard):** فحص تلقائي ثنائي الاتجاه يمنع تخزين المفاتيح السرية (AWS, OpenAI, GitHub, Private Keys) ويكشف محاولات الحقن الموجه وأوامر الـ Shell الخبيثة قبل وصولها إلى سياق النموذج.

---

## 🛠️ الأدوات المتاحة للوكيل (10 MCP Tools)

| الأداة (Tool) | الوظيفة الأساسية |
| :--- | :--- |
| `store_memory` | حفظ معلومة أو قرار معماري أو حل لمشكلة برمجية مع فحص أمني وتعتيم تلقائي للأسرار |
| `update_memory` | **[جديد v1.1]** تحديث ذكريات أو قرارات سابقة في مكانها مع الحفاظ على المعرّف (`ID`) ومزامنة فهرس البحث `FTS5` |
| `recall_memory` | بحث ذكي وسريع (`FTS5 BM25`) في ذاكرة الوكيل مع تصفية حسب المشروع أو التصنيف أو الأهمية |
| `delete_memory` | حذف ذاكرة محددة بواسطة المعرّف (`id`) عند انتهاء صلاحيتها |
| `save_session_handoff` | حفظ ملخص الجلسة الحالية (ما تم إنجازه، المعوقات، والخطوات القادمة) لاستكماله لاحقاً |
| `get_project_context` | استرجاع شامل لسياق المشروع (أهم الذكريات + آخر 3 جلسات + تفضيلات المطور) بضغطة واحدة |
| `sync_workspace_rules` | **[جديد v1.1]** توليد أو تحديث ملف `AGENTS.md` (أو `.cursorrules` / `CLAUDE.md`) تلقائياً من ذاكرة المشروع |
| `export_memory_snapshot` | **[جديد v1.1]** تصدير نسخة احتياطية كاملة (`JSON`) من الذكريات والجلسات والتفضيلات لنقلها أو أرشفتها |
| `set_preference` | حفظ تفضيل دائم للمطور (مثل: `language=ar`, `package_manager=pnpm`) |
| `security_audit_text` | فحص أي نص أو أمر برمجي ضد ثغرات `Node2Shell` وتسرّب الأسرار قبل تنفيذه |

---

## 📦 الموارد والقوالب الذكية (MCP Resources & Prompts)

### الموارد (Resources)
- `mindgate://stats`: إحصائيات فورية لقاعدة بيانات الذاكرة (عدد الذكريات، الجلسات، التفضيلات، وتوزيع التصنيفات).
- `mindgate://security/policy`: وثيقة سياسة الحماية النشطة لدرع `Node2Shell`.
- `mindgate://rules/agents-md`: **[جديد v1.1]** معاينة حية لملف قواعد الوكلاء (`AGENTS.md`) المولّد تلقائياً من ذاكرة المشروع.

### القوالب التوجيهية (Prompts)
- `bootstrap_session`: قالب جاهز لبدء جلسة برمجية جديدة واسترجاع سياق المشروع فوراً.
- `handoff_session`: قالب جاهز لتلخيص الجلسة الحالية وحفظها قبل الإغلاق.

---

## 🚀 التثبيت والتشغيل السريع

### الطريقة الأولى: التشغيل المباشر عبر `npx` (بعد النشر على npm)

```bash
npx -y mindgate-mcp --init
```

### الطريقة الثانية: التشغيل من المصدر (موصى به للتطوير المحلي على Windows / macOS / Linux)

```bash
# 1. استنساخ المستودع
git clone https://github.com/aaserag1/mindgate-mcp.git
cd mindgate-mcp

# 2. تثبيت الحزم البرمجية
npm install

# 3. بناء المشروع
npm run build

# 4. طباعة إعدادات الربط الجاهزة لـ Antigravity / Claude / Cursor
npm run init-config
```

---

## ⚙️ إعدادات الربط مع الوكلاء (Configuration)

### 1. الربط على نظام Windows (Antigravity / Cursor / Claude Desktop)

إذا كنت تشغل السيرفر محلياً على **Windows**، أضف هذا الإعداد في ملف `mcp_config.json`:

```json
{
  "mcpServers": {
    "mindgate": {
      "command": "node",
      "args": ["C:\\path\\to\\mindgate-mcp\\dist\\index.js"],
      "env": {
        "MINDGATE_DB_DIR": "C:\\Users\\YOUR_USER\\.mindgate-mcp"
      }
    }
  }
}
```

### 2. الربط عبر `npx` (سطر واحد لجميع الأنظمة)

```json
{
  "mcpServers": {
    "mindgate": {
      "command": "npx",
      "args": ["-y", "mindgate-mcp"]
    }
  }
}
```

### 3. الربط على macOS / Linux

```json
{
  "mcpServers": {
    "mindgate": {
      "command": "node",
      "args": ["/absolute/path/to/mindgate-mcp/dist/index.js"]
    }
  }
}
```

---

## 🛡️ كيف يعمل درع الحماية (Node2Shell Guard)؟

يحتوي الخادم على طبقة فحص أمني مستقلة (`src/security/node2shellGuard.ts`) تعمل في 3 مستويات:
1. **منع تنفيذ الأوامر التلقائي (Anti-RCE):** يرفض أي نص يحتوي على أنماط مثل `curl ... | bash`، أو `child_process.exec`، أو استدعاءات `nc -e /bin/sh`، أو أوامر `rm -rf /`.
2. **كشف الحقن الموجه (Anti-Prompt Injection):** يحبط محاولات التلاعب بسياق النموذج مثل `Ignore all previous instructions`.
3. **التعتيم التلقائي للأسرار (Auto-Secret Redaction):** يقوم بتحويل مفاتيح `sk-...` و `ghp_...` و `AKIA...` ورموز `JWT` تلقائياً إلى `[REDACTED:...]` قبل كتابتها على القرص الصلب.

---

## 🧪 تشغيل الاختبارات وفحص الكود

```bash
# فحص الأنواع البرمجية (TypeScript)
npm run typecheck

# بناء المشروع وتشغيل الاختبارات الشاملة
npm test
```

---

## 📄 الرخصة (License)

مرخّص بموجب رخصة [MIT](./LICENSE) — مفتوح المصدر بالكامل ومجاني للاستخدام الشخصي والتجاري.
