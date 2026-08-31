# Edge Add-ons / Chrome Web Store Submission Guide (商店发布指南)

This document contains all bilingual (English & Simplified Chinese) texts and metadata required for submitting **ONES Helper (ONES 工时助手)** v1.0.11 to the Microsoft Edge Add-ons Store and Chrome Web Store.

---

## Files / 提交素材清单

| File | Purpose | Specs |
|---|---|---|
| `../extension/icons/icon128.png` | Extension logo (reused from extension) | 128x128 PNG |
| `promo_small_440x280.png` | Small promotional tile | 440x280 PNG |
| `promo_large_1400x560.png` | Large promotional tile | 1400x560 PNG |
| `screenshot1_1280x800.png` | Screenshot | 1280x800 PNG |
| `PRIVACY.md` | Privacy policy | Markdown |

---

## Extension Basic Info / 扩展基本信息

### Extension Name / 插件名称

**English**:
```text
ONES Hours Helper
```

**Chinese (Simplified)**:
```text
ONES 工时助手
```

---

## Description / 商店详细描述

### English Version (英文版)

```text
ONES Hours Helper is a productivity extension for ONES project management platform users. It automatically reads your browser login session to plan, distribute, and submit work hours — no cookie copying required.

★ Why install it
Filling daily work hours in ONES is tedious and error-prone. This extension provides a standalone panel that fetches your tasks and attendance data, distributes hours across working days with one click, and submits them in bulk — saving you minutes every day.

★ Key Features
• Auto-reads browser login cookies — zero manual setup
• Standalone dashboard with 6-step workflow: fetch data → plan hours → preview distribution → submit → status transition → done
• Calendar view showing daily hour distribution (empty/partial/full)
• Auto token refresh via background service worker (every 30 min)
• Three-stage task status transition: To-Do → In-Progress → Review → Done
• Optional Beisen attendance integration for overtime hours
• Displays real user name (not UUID) via ONES GraphQL currentUser query
• Bilingual UI (English & Simplified Chinese) auto-matched with browser locale
• Preview mode to dry-run the entire flow without real submission
• 100% local processing — no third-party servers

★ How to use
1. Log in to ONES (ones.reachauto.com) in your browser
2. Click the extension toolbar icon → "Open Hours Panel"
3. Select target month, the dashboard auto-loads tasks and filled hours
4. Adjust hours per task, click "Next" through the 6-step flow
5. Hours are submitted and task statuses transitioned automatically

★ Permissions
• cookies — reserved for compatibility; main flow uses fetch + credentials: include to auto-send cookies
• storage — save user configuration (workflow, holidays, cached user name, etc.)
• alarms — schedule periodic token expiration check
• host_permissions: ones.reachauto.com, www.italent.cn — call ONES and Beisen APIs

★ Notes
• Must be logged in to ONES first
• Beisen attendance integration is optional (requires manual cookie paste)
• Token auto-refresh may fail if the session has fully expired — re-login to ONES to fix

★ Open source
https://github.com/duying0425/ones-helper
```

### Chinese Version (中文版)

```text
ONES 工时助手是一款面向 ONES 项目管理平台用户的效率插件。自动读取浏览器登录态，完成工时规划、分配与提交，无需手动复制 Cookie。

★ 为什么选择它
在 ONES 中逐日填写工时既繁琐又容易出错。本插件提供独立面板，自动获取任务和考勤数据，一键分配工时到工作日，批量提交，每天为你节省数分钟。

★ 核心功能
• 自动读取浏览器登录 Cookie — 零手动配置（基于 fetch + credentials: include，VPN/隐私环境也可用）
• 独立面板 6 步流程：获取数据 → 规划工时 → 预览分配 → 提交工时 → 状态流转 → 完成
• 日历视图展示每日工时分布（未填/部分/已满）
• background service worker 自动刷新 Token（每 30 分钟检查）
• 三阶段任务状态流转：未开始 → 进行中 → 审核中 → 已完成
• 可选北森考勤系统集成，自动获取加班工时
• 通过 ONES GraphQL currentUser 查询显示用户真实姓名（而非 UUID 短码）
• 中英文双语界面，根据浏览器语言自动切换
• 预览模式可走完全流程但不真实提交，便于核对
• 100% 本地处理，绝不上传任何用户数据

★ 使用方法
1. 在浏览器中登录 ONES（ones.reachauto.com）
2. 点击插件工具栏图标 → "打开工时填写面板"
3. 选择目标月份，面板自动加载任务和已填工时
4. 调整每个任务的工时，点击"下一步"走完 6 步流程
5. 工时自动提交，任务状态自动流转

★ 权限说明
• cookies — 备用兼容；主流程已改用 fetch + credentials: include 自动带 Cookie
• storage — 保存用户配置（工作流、节假日、缓存的用户姓名等）
• alarms — 定时检查 Token 过期
• host_permissions: ones.reachauto.com, www.italent.cn — 调用 ONES 与北森 API

★ 注意事项
• 需先在浏览器登录 ONES 账号
• 北森考勤集成通过浏览器自动带 Cookie，需先登录 www.italent.cn/portal
• 若会话已完全过期，Token 自动刷新可能失败 — 重新登录 ONES 即可恢复

★ 开源地址
https://github.com/duying0425/ones-helper
```

---

## Search terms / 搜索关键词

(Up to 7 terms, max 30 chars each)

**English**:
```text
ONES hours
work hours filler
timesheet automation
ONES time tracking
project hours planner
ones reachauto
worklog submitter
```

**Chinese (Simplified)**:
```text
ONES 工时
工时填写
工时自动化
工时计划
项目工时
工时助手
工时提交
```

---

## Privacy & Permissions / 隐私与权限说明

### Single Purpose Description / 单一用途说明

**English**:
```text
This extension allows users to automatically plan, distribute, and submit work hours to the ONES project management platform, and to transition task statuses (To-Do → In-Progress → Done). It operates on ones.reachauto.com and optionally cloud.italent.cn domains, reads the logged-in user's session cookies to authenticate API calls to ONES and Beisen endpoints, and saves user configuration locally. No data is collected, stored, or transmitted to any third party.
```

**Chinese (Simplified)**:
```text
本扩展的单一用途是帮助用户自动规划、分配并向 ONES 项目管理平台提交工时，以及流转任务状态（未开始 → 进行中 → 已完成）。本扩展在 ones.reachauto.com 和可选的 cloud.italent.cn 域名运行，读取登录态 Cookie 以调用 ONES 与北森官方 API，并在本地保存用户配置。扩展绝不收集、存储或向任何第三方传输用户数据。
```

### Justifications / 权限声明理由

#### cookies permission justification
**English**:
```text
Reserved for compatibility. The main authentication flow uses fetch with credentials: "include" to let the browser automatically attach the user's existing ONES login cookies (ones-lt, ones-ids-sid, ones-uid) when calling ONES GraphQL, OQL, and status transition endpoints. The cookies permission is kept as a fallback for diagnostic or future use. Without valid cookies, the ONES API returns 401 Unauthorized. All cookies remain in the browser and are sent exclusively to ones.reachauto.com.
```

**Chinese (Simplified)**:
```text
备用兼容权限。主认证流程使用 fetch + credentials: "include"，由浏览器在调用 ONES GraphQL、OQL 和状态流转 API 时自动附带用户已登录的 Cookie（ones-lt、ones-ids-sid、ones-uid）。cookies 权限仅作为诊断或未来用途的兜底保留。若无有效 Cookie，ONES API 将返回 401 认证失败。所有 Cookie 均保留在浏览器本地，仅随请求发送至 ones.reachauto.com 官方服务器。
```

#### storage permission justification
**English**:
```text
Used to save user-configurable settings (workflow definitions, holiday patches, Beisen configuration, daily overtime limit, cached ONES user name for popup display) via chrome.storage.local. The extension does not sync this data to any cloud account and the data is fully under user control.
```

**Chinese (Simplified)**:
```text
用于通过 chrome.storage.local 保存用户可配置的设置（工作流定义、节假日补丁、北森配置、每日加班上限、弹窗显示用的 ONES 用户姓名缓存等）。扩展不会将此数据同步到任何云账户，数据完全由用户控制。
```

#### alarms permission justification
**English**:
```text
Used to schedule a periodic check (every 30 minutes) for ONES token expiration, so the extension can auto-refresh the token before it expires without requiring manual user action.
```

**Chinese (Simplified)**:
```text
用于定时（每 30 分钟）检查 ONES Token 是否即将过期，以便在过期前自动刷新，无需用户手动操作。
```

#### Host Permissions (`https://ones.reachauto.com/*`, `https://cloud.italent.cn/*`, `https://www.italent.cn/*`) justification
**English**:
```text
Required to (1) read the ONES session cookie for API authentication, (2) call ONES GraphQL/OQL/status transition APIs, (3) submit work hours via addManhour mutation, and (4) optionally call the Beisen attendance API to fetch overtime data when the user has configured the Italent cookie.
```

**Chinese (Simplified)**:
```text
用于 (1) 读取 ONES 会话 Cookie 进行 API 认证，(2) 调用 ONES GraphQL/OQL/状态流转 API，(3) 通过 addManhour 提交工时，及 (4) 在用户配置北森 Cookie 后可选地调用北森考勤 API 获取加班数据。
```

---

## Privacy Policy URL / 隐私政策链接

```text
https://github.com/duying0425/ones-helper/blob/master/store/PRIVACY.md
```

---

## Notes for Certification / 给审核人员的备注

**English** (under 2000 chars, fits the "Notes for Certification" input):
```text
This extension submits work hours to ONES, a generic project-management system deployed as separate private instances per enterprise. The developer is only an end-user of one instance (https://ones.reachauto.com), not the platform operator.

Why test credentials cannot be provided (Policy 1.3.1):
1. No admin authority — the developer cannot create or issue ONES accounts; provisioning is controlled by each enterprise tenant's ONES admin.
2. Account = tenant data exposure — an ONES account is bound to a company. Logging in exposes that company's private project data (tasks, members, work hours). Sharing a personal account would leak employer confidential data and violate company security policy.
3. Generic multi-tenant system — ONES is deployed by many companies; the extension works against whichever instance the user is already logged into. There is no "official" test tenant the developer may distribute.

Alternative verification:
- Source code (audit all network calls, permissions, data flows): https://github.com/duying0425/ones-helper
- No hardcoded credentials — the extension only reads the browser's existing ONES session via fetch + credentials:"include". No embedded account, no background auth, no telemetry.
- Logged-out behavior (verifiable without any account): install the extension; the icon shows a red "!" badge, popup shows "Not logged in", dashboard shows an empty state (see background.js updateBadge, popup.js, dashboard.js loadAll).
- 6-step UI flow statically readable in extension/src/dashboard.js and engine.js.

Test steps (require an ONES account from that tenant's admin):
1. Log in to https://ones.reachauto.com.
2. Click the toolbar icon → popup shows "Logged in".
3. Click "Open Hours Panel" → dashboard loads tasks.
4. Select month, adjust hours, click "Next" through the 6-step flow.
5. Hours submitted, task statuses transitioned.

If the reviewer has no ONES tenant access, please rely on source-code review and the logged-out behavior above.
```

**Chinese (Simplified)**:
```text
本扩展用于向 ONES 项目管理平台提交工时，并流转任务状态。

== 无法提供测试账号的说明（对应政策 1.3.1） ==
ONES 是一套通用的、商业化部署的项目管理系统（https://ones.cn），由各家企业客户各自部署为独立运营的私有实例。本扩展开发者只是其中一个实例 https://ones.reachauto.com 的最终使用方，并非 ONES 平台的运营方。
因此无法提供测试账号，原因如下：
  1. 开发者对该 ONES 实例无任何管理权限，无法创建、重置或发放任何账号。账号发放由各企业客户的 ONES 管理员控制。
  2. ONES 账号均绑定具体企业租户，登录后会看到该公司的私有项目数据（任务、成员、工时记录等）。将个人账号共享给审核员会泄露雇主机密业务数据，违反公司信息安全政策。
  3. ONES 是通用系统，由多家不同公司分别部署；扩展在哪个 ONES 实例上工作，完全取决于用户当前已登录哪个实例。开发者无权对外分发任何"官方"测试租户。
综上，提供测试账号将泄露第三方（雇主）机密数据，且开发者无权这么做。

== 审核员可替代验证方式 ==
1. 扩展源代码已开源，可供审计：
   https://github.com/duying0425/ones-helper
   审核员可直接在仓库中检查所有网络请求、权限使用与数据流向。
2. 扩展不含任何硬编码账号，仅读取浏览器中已有的 ONES 登录态（基于 fetch + credentials: "include"）。无内嵌凭据、无后台认证、无隐藏遥测。
3. 在未登录 ONES 的情况下，扩展会安全进入"未登录"状态：
   • 扩展图标显示红色 "!" badge（见 background.js `updateBadge`）。
   • 弹窗显示"未登录"状态并提供"登录 ONES"按钮（见 popup.js）。
   • 面板显示空状态提示："未登录，请先在浏览器中登录 ones.reachauto.com"（见 dashboard.js `loadAll`）。
   background service worker 启动时会向 https://ones.reachauto.com/project/ 发送一次轻量 GET 请求（仅携带浏览器已为该域名保存的 Cookie，不发送任何额外凭据），仅用于更新图标 badge；在用户打开面板前不会调用任何业务 API。
   审核员可直接安装扩展、打开弹窗，验证该优雅降级行为，无需任何账号。
4. 6 步流程（获取数据 → 规划工时 → 预览分配 → 提交 → 状态流转 → 完成）可通过阅读 extension/src/dashboard.js 与 extension/src/engine.js 源码静态验证。

== 测试步骤（需要 ones.reachauto.com 的有效登录态） ==
1. 在浏览器中登录 https://ones.reachauto.com（审核员需持有该企业租户 ONES 管理员发放的账号）。
2. 点击插件工具栏图标，弹窗应显示"已登录"状态（含用户姓名）。
3. 点击"打开工时填写面板"在新标签页打开 dashboard。
4. 选择月份，面板自动加载任务和已填工时。
5. 调整每个任务的工时，点击"下一步"走完 6 步流程。
6. 工时自动提交到 ONES，任务状态自动流转。

若审核员无任何 ONES 租户访问权限，请以上述"源码审计（第 1 项）"与"未登录态行为（第 3 项）"作为认证依据。

v1.1.0 功能：
- 基于 fetch + credentials: include 自动带 Cookie（VPN/隐私环境也可用）。
- 独立面板 6 步流程，含日历预览。
- 三阶段任务状态流转（未开始 → 进行中 → 已完成）。
- 中英文双语界面。
- 可选北森考勤集成，自动获取加班工时。
- 弹窗显示用户真实姓名（通过 ONES GraphQL currentUser 查询，非 UUID）。
- 登录状态通过扩展图标 badge 颜色提示（不弹桌面通知）。
```

---

## Category / 分类

```text
Productivity / 生产力
```

---

## Submission History / 发布历史

| Version | Date | Status | Highlights |
|---|---|---|---|
| 1.0.0 | 2026-07-31 | Published | Initial release: auto cookie reading, 6-step dashboard, workflow transitions, bilingual i18n |
| 1.1.0 | 2026-08-20 | Published | Switch to fetch + credentials: include (VPN-compatible), remove notifications permission, add user name display via GraphQL currentUser, badge-based login status |
| 1.1.1 | 2026-08-26 | Published | Fix calcDefaultHours variable reference in dashboard, fix isLastStep comparison, add comprehensive unit test suite (102 tests) |
| 1.1.2 | 2026-08-28 | Published | Add standalone version endpoint and multi-extension hub deployment |
| 1.1.3 | 2026-08-31 | Ready for submission | Fix Step 4 button submitting lock bug, improve submission logs presentation and workflow transition UX, auto reload upon month change |
