import { checkAuth, checkItalentStatus } from "./engine.js";
import { applyI18n, t } from "./i18n.js";
import { saveConfig } from "./config.js";
import { jwtUserId } from "./api.js";

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const statusDetail = document.getElementById("statusDetail");
const italentDot = document.getElementById("italentDot");
const italentText = document.getElementById("italentText");
const italentDetail = document.getElementById("italentDetail");
const btnLoginOnes = document.getElementById("btnLoginOnes");
const btnSyncOnesTab = document.getElementById("btnSyncOnesTab");
const btnLoginItalent = document.getElementById("btnLoginItalent");
const btnDashboard = document.getElementById("btnDashboard");
const btnRefresh = document.getElementById("btnRefresh");
const btnOptions = document.getElementById("btnOptions");
const monthLabel = document.getElementById("monthLabel");
const linkOnes = document.getElementById("linkOnes");
const versionTag = document.getElementById("versionTag");

// 读取 manifest 中的版本号
const manifest = chrome.runtime.getManifest();
versionTag.textContent = `v${manifest.version}`;

const now = new Date();
monthLabel.textContent = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
linkOnes.href = "https://ones.reachauto.com/project/";

// 注入 i18n 文案
applyI18n();

// 从当前打开的 ONES 标签页直接提取登录凭证
async function syncTokenFromOnesTab() {
  try {
    const tabs = await chrome.tabs.query({ url: "*://*.reachauto.com/*" });
    if (!tabs || tabs.length === 0) {
      showToast(t("popupNoOnesTab", "未找到 ONES 标签页，即将打开登录页..."), "info");
      await openLoginPage("https://ones.reachauto.com/project/", btnLoginOnes, "ONES");
      return;
    }
    const targetTab = tabs[0];
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: () => {
        let lt = localStorage.getItem("ones-lt") || localStorage.getItem("auth_token") || localStorage.getItem("token") || "";
        if (!lt) {
          const m = document.cookie.match(/ones-lt=([^;]+)/);
          if (m) lt = m[1];
        }
        let sid = localStorage.getItem("ones-ids-sid") || localStorage.getItem("session_id") || "";
        if (!sid) {
          const m = document.cookie.match(/ones-ids-sid=([^;]+)/);
          if (m) sid = m[1];
        }
        let org = localStorage.getItem("ones-org-uuid") || localStorage.getItem("org_uuid") || "";
        if (!org) {
          const m = document.cookie.match(/ones-org-uuid=([^;]+)/);
          if (m) org = m[1];
        }
        return { lt, sid, org };
      }
    });

    if (results && results[0] && results[0].result) {
      const { lt, sid, org } = results[0].result;
      if (lt) {
        const uid = jwtUserId(lt);
        if (uid) {
          await saveConfig({ auth_token: lt, session_id: sid, org_uuid: org || "6ZKXo9yg", user_id: uid });
          showToast("已从 ONES 页面成功同步最新凭证！", "ok");
          refreshStatus();
          return;
        }
      }
    }
    showToast("页面内未找到有效 Token，已为您打开登录页", "info");
    await openLoginPage("https://ones.reachauto.com/project/", btnLoginOnes, "ONES");
  } catch (e) {
    showToast(`同步失败: ${e.message}`, "error");
  }
}

if (btnSyncOnesTab) {
  btnSyncOnesTab.addEventListener("click", syncTokenFromOnesTab);
}

// === 登录按钮逻辑 ===
async function openLoginPage(loginUrl, btn, siteName) {
  await chrome.tabs.create({ url: loginUrl });
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = t("popupLoginOpened", "已打开");
  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = originalText;
  }, 2000);
  showToast(
    t("popupLoginTip", "已打开{site}登录页，完成登录后请重新点开本插件")
      .replace("{site}", siteName),
    "info"
  );
}

btnLoginOnes.addEventListener("click", () => {
  openLoginPage("https://ones.reachauto.com/project/", btnLoginOnes, "ONES");
});

btnLoginItalent.addEventListener("click", () => {
  openLoginPage("https://www.italent.cn/portal/", btnLoginItalent, "北森");
});

// === 状态检测与渲染 ===

async function refreshStatus() {
  // ONES 状态
  statusText.textContent = t("popupStatusChecking", "检查中...");
  statusDot.className = "status-dot";
  btnLoginOnes.style.display = "none";
  if (btnSyncOnesTab) btnSyncOnesTab.style.display = "none";
  statusDetail.style.display = "none";
  statusDetail.textContent = "";
  // 北森状态
  italentText.textContent = t("popupItalentChecking", "北森：检查中...");
  italentDot.className = "status-dot";
  btnLoginItalent.style.display = "none";
  italentDetail.style.display = "none";
  italentDetail.textContent = "";

  const [auth, italent] = await Promise.all([
    checkAuth().catch(e => ({ ok: false, reason: e.message })),
    checkItalentStatus(false).catch(e => ({ ok: false, reason: e.message }))
  ]);

  // 渲染 ONES 状态
  if (auth.ok) {
    statusDot.classList.add("ok");
    const displayName = auth.userName || ((auth.userId || "").slice(0, 8) + "...");
    let msg = `${t("popupLoggedIn", "ONES：已登录")} · ${displayName}`;
    if (auth.refreshed) {
      msg = `${t("popupTokenRefreshed", "ONES：Token 已自动刷新")} · ${displayName}`;
    }
    statusText.textContent = msg;
  } else if (auth.expired) {
    statusDot.classList.add("err");
    statusText.textContent = auth.reason || t("popupTokenExpired", "ONES：Token 已过期");
    btnLoginOnes.style.display = "";
    if (btnSyncOnesTab) btnSyncOnesTab.style.display = "";
  } else {
    statusDot.classList.add("warn");
    statusText.textContent = auth.reason || t("popupNotLoggedIn", "ONES：未登录");
    btnLoginOnes.style.display = "";
    if (btnSyncOnesTab) btnSyncOnesTab.style.display = "";
    if (auth.reason) {
      statusDetail.textContent = auth.reason;
      statusDetail.style.display = "block";
    }
  }

  // 渲染北森状态
  if (italent.ok) {
    italentDot.classList.add("ok");
    const userShort = italent.userText || italent.userId || "";
    italentText.textContent = `${t("popupItalentLoggedIn", "北森考勤：已登录")} · ${userShort}`;
  } else {
    italentDot.classList.add("warn");
    italentText.textContent = t("popupItalentNotLoggedIn", "北森考勤：未登录（可选）");
    btnLoginItalent.style.display = "";
  }
}

btnDashboard.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

btnRefresh.addEventListener("click", refreshStatus);

btnOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function showToast(msg, type = "") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  toast.style.fontSize = "12px";
  toast.style.padding = "6px 12px";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

refreshStatus();
