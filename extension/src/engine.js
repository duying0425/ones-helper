// engine.js — 业务编排层（对应 Python main 流程，但拆分成可被 UI 调用的步骤）
// 设计原则：每个函数返回数据，UI 决定如何渲染/确认。不直接弹窗或阻塞。

import { readOnesCookies, jwtExp, jwtUserId, tryRefreshToken,
         readItalentCookies, detectItalentUser, fetchOnesUserName,
         fetchTasks, fetchFilledHours, fetchTasksByUuids,
         fetchTransitions, pickTransition, executeTransition,
         fetchItalentAttendance, parseItalentAttendance,
         submitEntry } from "./api.js";
import { workingDays } from "./holidays.js";
import { distribute } from "./distribute.js";
import { findStep, eligibleForUpdate, eligibleForMonthFullClose } from "./workflow.js";
import { loadConfig, saveConfig } from "./config.js";

const WD_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// === 认证状态检查 ===

// 用探测请求判断登录状态：fetch ONES 主页，看是否重定向到登录页
// 关键：用 credentials: "include" 让浏览器自动带 cookie
// 加超时保护：8 秒内无响应视为失败，避免 popup 卡在"检查中"
// 副作用1: 若从 finalUrl 中识别到 team_uuid，会自动保存到 storage（实现自动读取）
// 副作用2: 若从 HTML 中提取到 ones-lt token，会自动保存到 storage（让后续 OQL 能带 Authorization）
async function probeOnesLogin() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch("https://ones.reachauto.com/project/", {
      method: "GET",
      credentials: "include",
      redirect: "follow",
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    // 检查最终 URL（如果被重定向到登录页，说明未登录）
    const finalUrl = resp.url || "";
    if (finalUrl.includes("/login") || finalUrl.includes("/signin")) {
      return { ok: false, status: resp.status, finalUrl };
    }
    // HTTP 200 且没跳登录页 = 已登录
    if (resp.ok) {
      let html = "";
      try { html = await resp.text(); } catch (e) { /* ignore */ }

      // 从 finalUrl 中自动提取 team_uuid（URL 形如 /project/#/team/{team_uuid}/...）
      const teamMatch = finalUrl.match(/\/team\/([A-Za-z0-9]{6,})/);
      if (teamMatch && teamMatch[1]) {
        const cfg = await loadConfig();
        if (cfg.team_uuid !== teamMatch[1]) {
          await saveConfig({ team_uuid: teamMatch[1] });
        }
      }

      // 从 HTML 中提取 ones-lt token（ONES SPA 通常在 script 中嵌入 token）
      // 这是关键：有了 token 才能解析 user_id（org_user_uuid），OQL 才能工作
      let token = "";
      const tokenPatterns = [
        /"ones-lt"\s*:\s*"([A-Za-z0-9_.-]{20,})"/,
        /ones-lt=([A-Za-z0-9_.-]{20,})/,
        /"token"\s*:\s*"(eyJ[A-Za-z0-9_.-]{20,})"/,  // JWT 形式
        /"accessToken"\s*:\s*"(eyJ[A-Za-z0-9_.-]{20,})"/,
        /"auth_token"\s*:\s*"(eyJ[A-Za-z0-9_.-]{20,})"/
      ];
      for (const p of tokenPatterns) {
        const m = html.match(p);
        if (m && m[1]) { token = m[1]; break; }
      }
      if (token) {
        // 解析 JWT 拿到 org_user_uuid（与 Python 原版一致）
        const uid = jwtUserId(token);
        if (uid) {
          await saveConfig({ auth_token: token, user_id: uid });
          return { ok: true, userId: uid, authToken: token, source: "probe" };
        }
      }

      return { ok: true, userId: "", authToken: "" };
    }
    return { ok: false, status: resp.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// 返回当前认证状态
// 关键：必须有 auth_token + user_id 才算真正登录（OQL 需要 Authorization 头 + Ones-User-Id 头）
// 插件会自动从 Chrome Cookies 中捕获 ones-lt 和 ones-ids-sid，并解析 user_id
export async function checkAuth() {
  let cfg = await loadConfig();

  // 1. 优先尝试从浏览器 Chrome Cookies 直接捕获 ones-lt, ones-ids-sid, ones-org-uuid
  let cookieData = null;
  try {
    cookieData = await readOnesCookies();
  } catch (e) {}

  let authToken = (cookieData && cookieData.auth_token) || cfg.auth_token || "";
  let sessionId = (cookieData && cookieData.session_id) || cfg.session_id || "";
  let orgUuid = (cookieData && cookieData.org_uuid) || cfg.org_uuid || "6ZKXo9yg";
  let userId = jwtUserId(authToken) || cfg.user_id || "";
  let userName = cfg.user_name || "";

  // 2. 检查 token 是否有效
  if (authToken) {
    const exp = jwtExp(authToken);
    const now = Math.floor(Date.now() / 1000);

    // 如果 token 已过期
    if (exp && exp < now) {
      // 尝试用 session_id 刷新
      const newToken = await tryRefreshToken({ auth_token: authToken, session_id: sessionId, org_uuid: orgUuid });
      if (newToken) {
        authToken = newToken;
        userId = jwtUserId(newToken) || userId;
        await saveConfig({ auth_token: newToken, user_id: userId });
        if (!userName) userName = await fetchAndCacheUserName({ ...cfg, auth_token: newToken, user_id: userId });
        return { ok: true, userId, userName, authToken, sessionId, refreshed: true };
      }
      
      // 刷新失败：清除本地已失效的 Token，接触锁死，继续向下走降级探测流程
      authToken = "";
      userId = "";
      await saveConfig({ auth_token: "", user_id: "" });
    } else if (userId) {
      // Token 未过期且 userId 存在 -> 认定成功登录
      const updates = {};
      if (authToken !== cfg.auth_token) updates.auth_token = authToken;
      if (sessionId !== cfg.session_id) updates.session_id = sessionId;
      if (orgUuid !== cfg.org_uuid) updates.org_uuid = orgUuid;
      if (userId !== cfg.user_id) updates.user_id = userId;
      if (Object.keys(updates).length > 0) await saveConfig(updates);

      if (!userName) userName = await fetchAndCacheUserName({ ...cfg, auth_token: authToken, user_id: userId });
      return { ok: true, userId, userName, authToken, sessionId };
    }
  }

  // 3. 降级：若无有效 token，发请求触发浏览器携带最新登录 Session/Cookie 并重新扫描
  const probe = await probeOnesLogin();

  // 探测请求完成后，再次从 Cookie 尝试抓取（因为 probe 请求可能让浏览器刷写入了最新 Cookie）
  let latestCookieData = null;
  try {
    latestCookieData = await readOnesCookies();
  } catch (e) {}

  if (latestCookieData && latestCookieData.auth_token) {
    const latestToken = latestCookieData.auth_token;
    const exp = jwtExp(latestToken);
    const now = Math.floor(Date.now() / 1000);
    if (!exp || exp > now) {
      authToken = latestToken;
      userId = jwtUserId(latestToken);
      sessionId = latestCookieData.session_id || sessionId;
      await saveConfig({ auth_token: authToken, user_id: userId, session_id: sessionId });
      if (!userName) userName = await fetchAndCacheUserName({ ...cfg, auth_token: authToken, user_id: userId });
      return { ok: true, userId, userName, authToken, sessionId };
    }
  }

  if (probe.ok) {
    if (probe.authToken && probe.userId) {
      await saveConfig({ auth_token: probe.authToken, user_id: probe.userId });
      if (!userName) userName = await fetchAndCacheUserName({ ...cfg, auth_token: probe.authToken, user_id: probe.userId });
      return { ok: true, userId: probe.userId, userName, authToken: probe.authToken, sessionId };
    }
  }

  return {
    ok: false,
    reason: probe.error ? `探测失败: ${probe.error}` : "未在浏览器中获取到有效的 ONES 登录凭证，请先在浏览器中登录 ones.reachauto.com",
    userId: "", userName: "", authToken: "", sessionId
  };
}

// 获取并缓存 ONES 用户姓名到 storage，避免每次 popup 都查询
// 返回姓名字符串（失败返回空串）
async function fetchAndCacheUserName(cfg) {
  try {
    const info = await fetchOnesUserName(cfg, false);
    if (info && info.name) {
      await saveConfig({ user_name: info.name });
      return info.name;
    }
  } catch (e) { /* ignore */ }
  return "";
}

// 构造一个完整的 cfg 对象，供 API 调用使用
export async function buildCfg() {
  let cfg = await loadConfig();

  // 若 user_id 为空，自动通过 jwtUserId 解析
  if (!cfg.user_id && cfg.auth_token) {
    cfg.user_id = jwtUserId(cfg.auth_token);
  }

  // 若缺失凭证，尝试通过 Cookie 补全
  if (!cfg.auth_token || !cfg.user_id) {
    try {
      const cdata = await readOnesCookies();
      if (cdata.auth_token) cfg.auth_token = cdata.auth_token;
      if (cdata.session_id) cfg.session_id = cdata.session_id;
      if (cdata.user_id) cfg.user_id = cdata.user_id;
    } catch (e) {}
  }

  return {
    ...cfg,
    auth_token: cfg.auth_token || "",
    session_id: cfg.session_id || "",
    user_id: cfg.user_id || jwtUserId(cfg.auth_token) || "",
    org_uuid: cfg.org_uuid || "6ZKXo9yg"
  };
}

// === 主流程：分步实现 ===

// 步骤1：初始化月份、工作日、容量
export async function initMonth(year, month) {
  const cfg = await buildCfg();
  const wdays = workingDays(year, month, cfg);
  const wdayStrs = wdays.map(d => dateToStr(d));
  const capacity = wdays.length * 8;
  return { cfg, year, month, wdays: wdayStrs, capacity };
}

// 北森考勤系统状态检查（用于 options 页面显示 + 自动探测用户）
// 返回 { ok, hasCookie, cookieCount, userId, userText, reason }
// 北森考勤系统状态检查（用于 options 页面显示 + 自动探测用户）
export async function checkItalentStatus(debug = false) {
  const cfg = await loadConfig();

  // 1. 先检索浏览器中是否存在北森 Cookie
  let cookieStr = "";
  try {
    const italentCookies = await readItalentCookies();
    cookieStr = italentCookies.cookieStr;
  } catch (e) {}

  if (!cookieStr) {
    return { ok: false, reason: "未登录北森（未在浏览器检测到 Cookie）" };
  }

  // 2. 通过 API 动态检测登录身份并验证 Session 是否依然有效
  let userId = cfg.italent_user_id || "";
  let userText = cfg.italent_user_text || "";

  try {
    const detected = await detectItalentUser(cookieStr, debug);
    if (detected) {
      userId = detected.userId;
      userText = detected.userText || userId;
      await saveConfig({ italent_user_id: userId, italent_user_text: userText });
    } else if (!userId) {
      return { ok: false, reason: "登录凭证已失效（请在浏览器重新登录 cloud.italent.cn）" };
    }
  } catch (e) {
    if (!userId) {
      return { ok: false, reason: `探测失败: ${e.message}` };
    }
  }

  return {
    ok: true,
    userId,
    userText,
    reason: userId ? `已登录，用户：${userText}` : "已登录"
  };
}

// 步骤2：获取考勤系统加班数据
export async function fetchAttendanceData(cfg, year, month, debug = false) {
  const freshCfg = await loadConfig();
  const mergedCfg = { ...cfg, ...freshCfg };

  // 如果仍未抓到 italent_user_id，显式进行一次探测
  if (!mergedCfg.italent_user_id) {
    try {
      const status = await checkItalentStatus(debug);
      if (status.userId) {
        mergedCfg.italent_user_id = status.userId;
        mergedCfg.italent_user_text = status.userText;
      }
    } catch (e) {}
  }

  const res = await fetchItalentAttendance(mergedCfg, year, month, debug);
  if (!res || !res.data) {
    return { ok: false, reason: (res && res.reason) || "无法连通北森考勤接口", overtimeMap: {} };
  }
  const overtimeMap = parseItalentAttendance(res.data, year, month, debug, mergedCfg);
  const totalOt = Object.values(overtimeMap).reduce((a, b) => a + b, 0);
  return { ok: true, overtimeMap, totalOt };
}

// 步骤3：查询本月已填工时
export async function fetchFilled(cfg, teamUuid, year, month, debug = false) {
  const result = await fetchFilledHours(cfg, teamUuid, year, month, debug);
  if (result === null) return { ok: false, reason: "查询失败（token 可能已过期）" };
  const byTask = result._by_task || {};
  let total = 0;
  for (const [k, v] of Object.entries(result)) {
    if (k !== "_by_task") total += v;
  }
  return { ok: true, byDate: result, byTask, total };
}

// 步骤4：获取任务列表
export async function fetchTaskList(cfg, teamUuid, debug = false) {
  const result = await fetchTasks(cfg, teamUuid, debug);
  // fetchTasks 现在返回 { tasks, code, reason }
  const tasks = result.tasks || [];
  const code = result.code || 0;
  const reason = result.reason || "";
  // 只有 HTTP 200 且确实没查到任务，才算"未找到任务"
  // 401/403/404/0 都算认证或请求失败
  if (code === 200) {
    return { ok: true, tasks, code, reason: tasks.length === 0 ? "本月暂无未完成任务" : "" };
  }
  return { ok: false, tasks, code, reason: reason || `查询失败（HTTP ${code}）` };
}

// 步骤5：根据任务列表 + 已填工时 + 月度容量，计算每个任务的默认工时
// 对应 Python input_hours 的默认值计算逻辑
export function calcDefaultHours(tasks, taskFilled, capacity, totalFilled) {
  let monthRemain = Math.max(0, capacity - totalFilled);
  const result = {};
  for (const t of tasks) {
    const filed = taskFilled[t.uuid] || 0;
    const taskRem = t._remaining || 0;
    let defaultH = 0;
    if (taskRem > 0) {
      defaultH = Math.round(Math.min(taskRem, monthRem) * 10) / 10;
    }
    result[t.uuid] = { name: t._display || t.summary, uuid: t.uuid, hours: defaultH, filed, taskRem };
  }
  return result;
}

// 步骤6：分配工时到工作日
// taskHours: { uuid: {name, uuid, hours, is_overtime?} }
// 返回 { entries, remaining }
export function distributeHours(taskHours, wdays, filledHours, dailyLimit = 8.0) {
  return distribute(taskHours, wdays, filledHours, dailyLimit);
}

// 步骤7：批量执行状态流转
// targets: 待处理的任务列表
// 返回 { updated: [...], failed: [...], skipped: [...] }
// 状态名 → category 的映射（用于流转后更新任务的 _category 字段）
const STATUS_TO_CAT = {
  "未开始": "to_do",
  "进行中": "in_progress",
  "完成审核中": "in_progress",
  "已完成": "done"
};

export async function batchStatusUpdate(cfg, teamUuid, targets, debug = false) {
  const updated = [], failed = [], skipped = [];
  for (const t of targets) {
    const step = findStep(cfg, t);
    if (!step) { skipped.push({ task: t, reason: "无匹配 workflow 步骤" }); continue; }
    const transitions = await fetchTransitions(cfg, teamUuid, t.uuid, debug);
    if (!transitions || !transitions.length) {
      skipped.push({ task: t, reason: "无可用流转，或 API 失败" });
      continue;
    }
    const tr = pickTransition(transitions, step.button);
    if (!tr) {
      skipped.push({ task: t, reason: `找不到按钮 '${step.button}'` });
      continue;
    }
    const { ok, reason } = await executeTransition(cfg, teamUuid, t.uuid, tr.uuid, step.comment, debug);
    if (ok) {
      // 根据目标状态名更新 _category，保证后续候选筛选正确
      const newCat = STATUS_TO_CAT[step.to_status];
      if (newCat) t._category = newCat;
      t._status_name = step.to_status;
      updated.push({ task: t, toStatus: step.to_status });
    } else {
      failed.push({ task: t, reason });
    }
  }
  return { updated, failed, skipped };
}

// 步骤8：提交工时
// entries: [{task_uuid, task_name, date, hours, is_overtime}]
// 返回 { ok: [...], fail: [...] }
export async function submitEntries(cfg, teamUuid, entries, debug = false) {
  const okList = [], failList = [];
  for (const e of entries) {
    const { ok, msg } = await submitEntry(cfg, teamUuid, e, debug);
    if (ok) okList.push({ entry: e, key: msg });
    else failList.push({ entry: e, reason: msg });
  }
  return { ok: okList, fail: failList };
}

// 步骤9：阶段2 候选筛选（进行中 → 提交审核）
// tasks: 全部任务；submittedByTask: {uuid: hours} 本次提交的工时
// 注：findStep 需要 cfg（读 workflow 配置），因此提供 async 版本由调用方传入 cfg
export async function filterStage2CandidatesAsync(cfg, tasks, year, month, submittedByTask = {}) {
  return tasks.filter(t => {
    if (!(t._status_name || "").includes("进行中")) return false;
    if (t._category !== "in_progress") return false;
    if (findStep(cfg, t) === null) return false;
    const extra = submittedByTask[t.uuid] || 0;
    return eligibleForUpdate(t, year, month, extra);
  });
}

// 步骤10：阶段3 候选筛选（完成审核中 → 已完成）
export function filterStage3Candidates(cfg, tasks, year, month) {
  return tasks.filter(t => {
    if (t._category !== "in_progress") return false;
    if ((t._status_name || "").includes("进行中")) return false;  // 阶段2已处理
    if (findStep(cfg, t) === null) return false;
    return eligibleForUpdate(t, year, month);
  });
}

// 步骤11：阶段2b 候选筛选（月度已满，任务当月结束 → 提交审核）
export function filterMonthFullCandidates(cfg, tasks, year, month) {
  return tasks.filter(t => {
    if (t._category !== "in_progress") return false;
    if (!(t._status_name || "").includes("进行中")) return false;
    if (findStep(cfg, t) === null) return false;
    return eligibleForMonthFullClose(t, year, month);
  });
}

// 步骤12：最终状态刷新 + 汇总
// 返回 { byDate, byTask, total, filledDays, taskRows: [...] }
export async function refreshFinalStatus(cfg, teamUuid, year, month, wdays, capacity, tasks, debug = false) {
  await sleep(1000); // 等服务器处理
  const result = await fetchFilledHours(cfg, teamUuid, year, month, debug);
  if (result === null) return { ok: false };

  const byTask = result._by_task || {};
  let total = 0;
  for (const [k, v] of Object.entries(result)) {
    if (k !== "_by_task") total += v;
  }
  const filledDays = wdays.filter(d => (result[d] || 0) >= 8 - 0.01).length;
  const taskMap = new Map(tasks.map(t => [t.uuid, t]));

  const shownUuids = new Set();
  const rows = [];

  // 1. 先展示本月有工时的活跃任务
  for (const t of tasks) {
    if (!byTask[t.uuid]) continue;
    rows.push({
      proj: t._proj || "",
      summary: t.summary || "",
      status: t._status_name || "",
      filed: byTask[t.uuid],
      taskRem: t._remaining || 0,
      isActive: true
    });
    shownUuids.add(t.uuid);
  }

  // 2. by_task 里有但不在活跃任务里的（已完成任务），逐条 GraphQL 查询
  const otherUuids = Object.keys(byTask).filter(u => !shownUuids.has(u));
  if (otherUuids.length) {
    const doneMap = await fetchTasksByUuids(cfg, teamUuid, otherUuids, debug);
    for (const uuid of otherUuids) {
      const info = doneMap[uuid] || {};
      rows.push({
        proj: info._proj || "",
        summary: info.summary || uuid,
        status: info._status_name || "已完成",
        filed: byTask[uuid],
        taskRem: 0,
        isActive: false
      });
    }
  }

  return { ok: true, byDate: result, byTask, total, filledDays, rows };
}

// === 辅助函数 ===

export function dateToStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function weekdayName(dateStr) {
  const d = new Date(dateStr);
  return WD_NAMES[d.getDay()];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
