// background.js — service worker
// 职责：定时检查 token 过期 + 自动刷新；监听标签页变化检测登录状态
//
// 关键设计：不用 chrome.cookies API（在 VPN/隐私环境下读不到 cookie）
// 改用 fetch + credentials: "include" 让浏览器自动带 cookie，参考 MinuteExport 的做法

import { loadConfig, saveConfig, DEFAULT_CONFIG } from "./src/config.js";
import { jwtExp, tryRefreshToken } from "./src/api.js";
import { checkAuth } from "./src/engine.js";

// 扩展安装/更新时初始化默认配置
chrome.runtime.onInstalled.addListener(async (details) => {
  const stored = await chrome.storage.local.get("config");
  if (!stored.config) {
    await chrome.storage.local.set({ config: { ...DEFAULT_CONFIG } });
    console.log("[ONES Helper] 已初始化默认配置");
  }
  // 首次运行或更新时，触发一次凭证捕获
  checkAuth().catch(() => {});
  // 创建定时器：每 30 分钟检查一次 token
  await chrome.alarms.create("token-check", { periodInMinutes: 30 });
});

// 监听 ONES Cookie 变化，自动提取并同步凭证
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.cookie.domain.includes("reachauto.com")) {
    if (changeInfo.cookie.name === "ones-lt" || changeInfo.cookie.name === "ones-ids-sid") {
      checkAuth().catch(() => {});
    }
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "token-check") {
    await checkAndRefreshToken();
  }
});

async function checkAndRefreshToken() {
  try {
    const cfg = await loadConfig();
    const token = cfg.auth_token || "";
    if (!token) return; // 无 token，跳过

    const exp = jwtExp(token);
    if (!exp) return;

    const now = Math.floor(Date.now() / 1000);
    const remainMin = Math.floor((exp - now) / 60);
    // 5 分钟内要过期才刷新（避免频繁请求）
    if (remainMin > 5) return;

    console.log(`[ONES Helper] Token 即将过期（剩 ${remainMin} 分钟），尝试自动刷新...`);
    const newToken = await tryRefreshToken({
      session_id: cfg.session_id,
      org_uuid: cfg.org_uuid
    });
    if (newToken) {
      await saveConfig({ auth_token: newToken });
      console.log("[ONES Helper] Token 自动刷新成功");
    } else {
      console.warn("[ONES Helper] Token 自动刷新失败");
    }
  } catch (e) {
    console.error("[ONES Helper] token-check 异常:", e);
  }
}

// === 登录状态监听 ===
// 监听标签页更新事件：当用户在 ONES/北森 登录页完成登录后，URL 会跳转
// 此时检测登录状态并通知用户
// 这个方案不依赖 chrome.cookies API（该 API 在 VPN 环境下读不到 cookie）

let lastOnesLoggedIn = false;
let lastItalentLoggedIn = false;

// 监听标签页更新：登录完成时页面会跳转
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!tab.url) return;
  // 只在页面加载完成时检查
  if (changeInfo.status !== "complete") return;

  const url = tab.url;
  const isOnesPage = url.includes("ones.reachauto.com");
  const isItalentPage = url.includes("italent.cn");

  if (!isOnesPage && !isItalentPage) return;

  // ONES 页面：自动从 URL 中提取 team_uuid（用户访问时 URL 形如 /team/{team_uuid}/...）
  if (isOnesPage) {
    extractAndSaveTeamUuid(url);
  }

  // 延迟 1 秒检查（等 cookie 完全写入）
  setTimeout(() => checkAndNotifyLogin(), 1000);
});

// 从 ONES URL 中提取 team_uuid 并保存到 storage
// URL 形如 https://ones.reachauto.com/project/#/team/SpBJdKsD/...
// 或 https://ones.reachauto.com/project/team/SpBJdKsD/...
async function extractAndSaveTeamUuid(url) {
  try {
    const match = url.match(/\/team\/([A-Za-z0-9]{6,})/);
    if (match && match[1]) {
      const teamUuid = match[1];
      const cfg = await loadConfig();
      if (cfg.team_uuid !== teamUuid) {
        await saveConfig({ team_uuid: teamUuid });
        console.log("[ONES Helper] 自动提取 team_uuid:", teamUuid);
      }
    }
  } catch (e) { /* ignore */ }
}

// 用探测请求检查 ONES 登录状态
async function probeOnesLogin() {
  try {
    const resp = await fetch("https://ones.reachauto.com/project/", {
      method: "GET",
      credentials: "include",
      redirect: "follow"
    });
    const finalUrl = resp.url || "";
    if (finalUrl.includes("/login") || finalUrl.includes("/signin")) return false;
    return resp.ok;
  } catch (e) {
    return false;
  }
}

// 用探测请求检查北森登录状态
async function probeItalentLogin() {
  try {
    const resp = await fetch("https://www.italent.cn/", {
      method: "GET",
      credentials: "include",
      redirect: "follow"
    });
    const finalUrl = resp.url || "";
    // 北森未登录会重定向到 passport 登录页
    if (finalUrl.includes("passport") && finalUrl.includes("login")) return false;
    return resp.ok;
  } catch (e) {
    return false;
  }
}

async function checkAndNotifyLogin() {
  try {
    const [onesOk, italentOk] = await Promise.all([
      probeOnesLogin(),
      probeItalentLogin()
    ]);

    // ONES 状态变化：未登录 → 已登录（仅记录日志和更新 badge，不再弹桌面通知）
    if (onesOk && !lastOnesLoggedIn) {
      console.log("[ONES Helper] 检测到 ONES 登录成功");
    }
    lastOnesLoggedIn = onesOk;

    // 北森状态变化：未登录 → 已登录（仅记录日志，不再弹桌面通知）
    if (italentOk && !lastItalentLoggedIn) {
      console.log("[ONES Helper] 检测到北森登录成功");
    }
    lastItalentLoggedIn = italentOk;

    // 更新扩展图标 badge（替代桌面通知，更轻量）
    updateBadge(onesOk, italentOk);
  } catch (e) {
    console.error("[ONES Helper] 登录状态检查异常:", e);
  }
}

// 根据登录状态更新扩展图标 badge
async function updateBadge(onesOk, italentOk) {
  let text, color;
  if (onesOk && italentOk) {
    text = ""; color = "#00B42A";
  } else if (onesOk) {
    text = "!B"; color = "#FF7D00";
  } else {
    text = "!"; color = "#F53F3F";
  }
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
  } catch (e) { /* ignore */ }
}

// 启动时初始化一次 badge
checkAndNotifyLogin().catch(() => {});

// 暴露给 popup 查询最近一次登录状态（调试用）
globalThis.lastLoginCheck = () => ({ lastOnesLoggedIn, lastItalentLoggedIn });
