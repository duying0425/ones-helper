// options.js — 配置页面逻辑

import { loadConfig, saveFullConfig, resetConfig, DEFAULT_CONFIG } from "./config.js";
import { applyI18n, t } from "./i18n.js";
import { checkAuth, checkItalentStatus } from "./engine.js";

// 注入 i18n 文案
applyI18n();

const fields = {
  overtime_daily_max: document.getElementById("overtime_daily_max"),
  italent_standard_work_hours: document.getElementById("italent_standard_work_hours"),
  extra_holidays: document.getElementById("extra_holidays")
};

// ONES 状态 DOM
const onesStatusDot = document.getElementById("onesStatusDot");
const onesStatusText = document.getElementById("onesStatusText");
const btnRecheckOnes = document.getElementById("btnRecheckOnes");

// 北森状态 DOM
const italentStatusDot = document.getElementById("italentStatusDot");
const italentStatusText = document.getElementById("italentStatusText");
const italentLoginTip = document.getElementById("italentLoginTip");
const btnRecheckItalent = document.getElementById("btnRecheckItalent");

// 检测 ONES 登录状态
async function checkOnes() {
  onesStatusText.textContent = t("popupStatusChecking", "ONES：检查中...");
  onesStatusDot.className = "status-dot";
  btnRecheckOnes.disabled = true;

  try {
    const auth = await checkAuth();
    if (auth.ok) {
      onesStatusDot.classList.add("ok");
      const userShort = auth.userName || auth.userId || "";
      onesStatusText.textContent = `${t("popupLoggedIn", "ONES：已登录")}${userShort ? " · " + userShort : ""}`;

      const cfg = await loadConfig();
      const tooltip = [
        `Team UUID: ${cfg.team_uuid || "SpBJdKsD"}`,
        `Org UUID: ${cfg.org_uuid || "6ZKXo9yg"}`,
        `User ID: ${auth.userId || "-"}`
      ].join("\n");
      onesStatusText.setAttribute("title", tooltip);
    } else {
      onesStatusDot.classList.add("err");
      onesStatusText.textContent = auth.reason || t("popupNotLoggedIn", "ONES：未登录");
      onesStatusText.removeAttribute("title");
    }
  } catch (e) {
    onesStatusDot.classList.add("err");
    onesStatusText.textContent = `${t("popupCheckFailed", "ONES：检查失败")}: ${e.message}`;
    onesStatusText.removeAttribute("title");
  } finally {
    btnRecheckOnes.disabled = false;
  }
}

// 检测北森登录状态
async function checkItalent() {
  italentStatusText.textContent = t("optionsItalentChecking", "北森考勤：检测中...");
  italentStatusDot.className = "status-dot";
  if (italentLoginTip) italentLoginTip.style.display = "none";
  btnRecheckItalent.disabled = true;

  try {
    const status = await checkItalentStatus(false);
    if (status.ok) {
      italentStatusDot.classList.add("ok");
      const userShort = status.userText || status.userId || "";
      italentStatusText.textContent = `${t("optionsItalentOk", "北森考勤：已登录")}${userShort ? " · " + userShort : ""}`;
      
      const tooltip = [
        `User ID: ${status.userId || "-"}`,
        `Cookie Count: ${status.cookieCount || 0}`
      ].join("\n");
      italentStatusText.setAttribute("title", tooltip);
    } else {
      italentStatusDot.classList.add("err");
      italentStatusText.textContent = status.reason || t("optionsItalentNotLoggedIn", "北森考勤：未登录（可选）");
      italentStatusText.removeAttribute("title");
      if (italentLoginTip) italentLoginTip.style.display = "block";
    }
  } catch (e) {
    italentStatusDot.classList.add("err");
    italentStatusText.textContent = `${t("optionsItalentCheckFailed", "检测失败")}: ${e.message}`;
    italentStatusText.removeAttribute("title");
    if (italentLoginTip) italentLoginTip.style.display = "block";
  } finally {
    btnRecheckItalent.disabled = false;
  }
}

btnRecheckOnes.addEventListener("click", checkOnes);
btnRecheckItalent.addEventListener("click", checkItalent);

// 页面加载后自动检测
checkOnes();
checkItalent();

const workflowEditor = document.getElementById("workflowEditor");
const btnAddType = document.getElementById("btnAddType");
const btnSave = document.getElementById("btnSave");
const btnReset = document.getElementById("btnReset");
const btnExport = document.getElementById("btnExport");

let currentWorkflow = {};

function renderWorkflow(workflow) {
  currentWorkflow = JSON.parse(JSON.stringify(workflow));
  workflowEditor.innerHTML = "";

  for (const [typeName, steps] of Object.entries(currentWorkflow)) {
    workflowEditor.appendChild(createTypeBlock(typeName, steps));
  }
}

function createTypeBlock(typeName, steps) {
  const block = document.createElement("div");
  block.className = "workflow-type";

  const header = document.createElement("h3");
  const titleInput = document.createElement("input");
  titleInput.className = "input";
  titleInput.value = typeName;
  titleInput.style.fontSize = "14px";
  titleInput.style.fontWeight = "600";
  titleInput.placeholder = "工作项类型名（如：任务、工作任务）";
  titleInput.addEventListener("change", () => {
    const newType = titleInput.value.trim();
    if (newType && newType !== typeName) {
      delete currentWorkflow[typeName];
      currentWorkflow[newType] = steps;
    }
  });
  header.appendChild(titleInput);

  const delBtn = document.createElement("button");
  delBtn.className = "btn-ghost btn-sm";
  delBtn.textContent = "删除类型";
  delBtn.addEventListener("click", () => {
    delete currentWorkflow[typeName];
    block.remove();
  });
  header.appendChild(delBtn);
  block.appendChild(header);

  // 步骤列表
  const stepsContainer = document.createElement("div");
  steps.forEach((step, idx) => {
    stepsContainer.appendChild(createStepRow(steps, idx));
  });
  block.appendChild(stepsContainer);

  // 添加步骤按钮
  const addStepBtn = document.createElement("button");
  addStepBtn.className = "btn-secondary btn-sm";
  addStepBtn.textContent = "+ 添加步骤";
  addStepBtn.addEventListener("click", () => {
    steps.push({ status: "", button: "", comment: "" });
    stepsContainer.appendChild(createStepRow(steps, steps.length - 1));
  });
  block.appendChild(addStepBtn);

  return block;
}

function createStepRow(steps, idx) {
  const row = document.createElement("div");
  row.className = "workflow-step";

  const statusInput = document.createElement("input");
  statusInput.className = "input";
  statusInput.placeholder = "状态名（如：未开始）";
  statusInput.value = steps[idx].status || "";
  statusInput.addEventListener("input", () => steps[idx].status = statusInput.value);

  const buttonInput = document.createElement("input");
  buttonInput.className = "input";
  buttonInput.placeholder = "流转按钮名（最后一步留空）";
  buttonInput.value = steps[idx].button || "";
  buttonInput.addEventListener("input", () => steps[idx].button = buttonInput.value);

  const commentInput = document.createElement("input");
  commentInput.className = "input";
  commentInput.placeholder = "评论（可选）";
  commentInput.value = steps[idx].comment || "";
  commentInput.addEventListener("input", () => steps[idx].comment = commentInput.value);

  const delBtn = document.createElement("button");
  delBtn.className = "btn-ghost btn-sm";
  delBtn.textContent = "✕";
  delBtn.title = "删除此步骤";
  delBtn.addEventListener("click", () => {
    steps.splice(idx, 1);
    row.remove();
  });

  row.appendChild(statusInput);
  row.appendChild(buttonInput);
  row.appendChild(commentInput);
  row.appendChild(delBtn);
  return row;
}

btnAddType.addEventListener("click", () => {
  const newType = "新类型";
  let typeName = newType;
  let i = 1;
  while (currentWorkflow[typeName]) {
    typeName = `${newType}${i++}`;
  }
  currentWorkflow[typeName] = [
    { status: "未开始", button: "开始任务" },
    { status: "进行中", button: "完成任务" },
    { status: "已完成" }
  ];
  workflowEditor.appendChild(createTypeBlock(typeName, currentWorkflow[typeName]));
});

async function load() {
  const cfg = await loadConfig();
  for (const [k, el] of Object.entries(fields)) {
    if (k === "extra_holidays") {
      el.value = JSON.stringify(cfg.extra_holidays || {}, null, 2);
    } else {
      el.value = cfg[k] !== undefined ? cfg[k] : "";
    }
  }
  renderWorkflow(cfg.workflow || {});
}

btnSave.addEventListener("click", async () => {
  try {
    const cfg = await loadConfig();
    const newCfg = { ...cfg };
    for (const [k, el] of Object.entries(fields)) {
      // readonly 字段（team_uuid / org_uuid）由扩展自动读取维护，保存时跳过，避免空值覆盖
      if (el.hasAttribute("readonly")) continue;
      let v = el.value;
      if (k === "overtime_daily_max" || k === "italent_standard_work_hours") {
        v = parseFloat(v) || 0;
      } else if (k === "extra_holidays") {
        try { v = JSON.parse(v); } catch (e) { showToast(t("optionsJsonError", "节假日 JSON 格式错误"), "error"); return; }
      }
      newCfg[k] = v;
    }
    newCfg.workflow = currentWorkflow;
    await saveFullConfig(newCfg);
    showToast(t("optionsSaved", "已保存"), "success");
  } catch (e) {
    showToast(`${t("optionsSaved", "已保存")}失败: ${e.message}`, "error");
  }
});

btnReset.addEventListener("click", async () => {
  if (!confirm("确定要重置为默认配置吗？")) return;
  const cfg = await resetConfig();
  for (const [k, el] of Object.entries(fields)) {
    if (k === "extra_holidays") {
      el.value = JSON.stringify(cfg.extra_holidays, null, 2);
    } else {
      el.value = cfg[k] !== undefined ? cfg[k] : "";
    }
  }
  renderWorkflow(cfg.workflow);
  showToast(t("optionsResetDone", "已重置为默认"), "success");
});

btnExport.addEventListener("click", async () => {
  const cfg = await loadConfig();
  // 导出时移除浏览器自动维护的 auth_token（对应原 config.example.json 的做法）
  const exportCfg = { ...cfg };
  delete exportCfg.auth_token;
  const blob = new Blob([JSON.stringify(exportCfg, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "config.json";
  a.click();
  URL.revokeObjectURL(url);
  showToast(t("optionsExported", "已导出 config.json"), "success");
});

function showToast(msg, type = "") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

load();
