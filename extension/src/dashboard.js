// dashboard.js — 独立工时填写面板（替代原控制台交互流程）

import {
  initMonth, buildCfg, fetchAttendanceData, fetchFilled, fetchTaskList,
  calcDefaultHours, distributeHours, batchStatusUpdate, submitEntries,
  filterStage2CandidatesAsync, filterStage3Candidates, filterMonthFullCandidates,
  refreshFinalStatus, dateToStr, weekdayName, checkAuth
} from "./engine.js";
import { findStep } from "./workflow.js";
import { applyI18n, t } from "./i18n.js";

// 注入 i18n 文案
applyI18n();

// 渲染版本号
const manifest = typeof chrome !== "undefined" && chrome.runtime?.getManifest ? chrome.runtime.getManifest() : null;
const versionTag = document.getElementById("dashboardVersionTag");
if (versionTag && manifest) {
  versionTag.textContent = `v${manifest.version}`;
}

// === 全局状态 ===
const state = {
  step: 1,
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  debug: false,
  dryRun: false,

  cfg: null,
  teamUuid: "",
  wdays: [],
  capacity: 0,

  attendance: null,        // {ok, overtimeMap, totalOt?}
  filled: null,            // {ok, byDate, byTask, total}
  tasks: [],               // 任务列表

  // 用户在步骤2中调整的工时 {uuid: hours}
  taskHours: {},
  overtimeHours: {},
  userNormalHours: {},
  userOvertimeHours: {},

  // 分配结果
  entries: [],
  overtimeEntries: [],

  // 提交结果与状态
  isSubmitting: false,
  submitResult: null,

  // 流转状态
  _transitionsLoaded: false,
  _stage1Result: null,
  _stage2Candidates: null,
  _stage3Candidates: null,
  _monthFullCandidates: null,

  finalStatus: null
};

// === DOM ===
const monthInput = document.getElementById("monthInput");
const btnPrevMonth = document.getElementById("btnPrevMonth");
const btnNextMonth = document.getElementById("btnNextMonth");
const btnDebug = document.getElementById("btnDebug");
const btnOptions = document.getElementById("btnOptions");
const btnRefresh = document.getElementById("btnRefresh");
const btnDryRun = document.getElementById("btnDryRun");
const btnNext = document.getElementById("btnNext");
const mainPanel = document.getElementById("mainPanel");

const statCapacity = document.getElementById("statCapacity");
const statFilled = document.getElementById("statFilled");
const statGap = document.getElementById("statGap");
const statOvertime = document.getElementById("statOvertime");

const steps = [1, 2, 3, 4, 5, 6].map(i => document.getElementById(`step${i}`));

// === 初始化 ===

function pad2(n) { return String(n).padStart(2, "0"); }

function setMonth(y, m) {
  state.year = y;
  state.month = m;
  monthInput.value = `${y}-${pad2(m)}`;
}

monthInput.addEventListener("change", () => {
  const [y, m] = monthInput.value.split("-").map(Number);
  if (y && m) {
    setMonth(y, m);
    loadAll();
  }
});

btnPrevMonth.addEventListener("click", () => {
  let m = state.month - 1, y = state.year;
  if (m < 1) { m = 12; y--; }
  setMonth(y, m);
  loadAll();
});

btnNextMonth.addEventListener("click", () => {
  let m = state.month + 1, y = state.year;
  if (m > 12) { m = 1; y++; }
  setMonth(y, m);
  loadAll();
});

btnDebug.addEventListener("click", () => {
  state.debug = !state.debug;
  btnDebug.style.background = state.debug ? "var(--color-warning)" : "";
  btnDebug.style.color = state.debug ? "white" : "";
});

btnOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
btnDryRun.addEventListener("click", () => {
  state.dryRun = !state.dryRun;
  btnDryRun.style.background = state.dryRun ? "var(--color-primary)" : "";
  btnDryRun.style.color = state.dryRun ? "white" : "";
  if (state.dryRun) showToast("已开启预览模式（不提交）", "info");
});
btnRefresh.addEventListener("click", () => loadAll());

btnNext.addEventListener("click", () => goNext());

setMonth(state.year, state.month);

// === 步骤控制 ===

function setStep(n) {
  state.step = n;
  steps.forEach((el, i) => {
    el.classList.remove("active", "done");
    if (i + 1 < n) el.classList.add("done");
    else if (i + 1 === n) el.classList.add("active");
  });
  render();
}

function goNext() {
  if (state.step === 1) {
    // 数据已加载，进入步骤2
    setStep(2);
  } else if (state.step === 2) {
    // 保存工时输入，进入步骤3
    collectTaskHours();
    computeDistribution();
    setStep(3);
  } else if (state.step === 3) {
    // 预览确认，进入步骤4
    if (state.dryRun) {
      showToast(t("dashboardPreviewMode", "预览模式：不会真实提交"), "info");
      setStep(6);
    } else {
      setStep(4);
    }
  } else if (state.step === 4) {
    const allEntries = [...state.entries, ...state.overtimeEntries];
    if (allEntries.length === 0 || state.submitResult) {
      // 已完成提交或无工时，进入步骤5
      setStep(5);
    } else {
      // 执行提交
      doSubmit();
    }
  } else if (state.step === 5) {
    // 状态流转处理完毕，进入步骤6
    setStep(6);
  } else if (state.step === 6) {
    // 完成，重新加载
    loadAll();
  }
}

// === Banner 摘要实时更新 ===

function updateBannerStats({ capacity, filled, plannedNormal = 0, plannedOt = 0, attendance } = {}) {
  const cap = capacity !== undefined ? capacity : state.capacity;
  if (statCapacity) statCapacity.textContent = `${cap}h`;

  const totalFilled = filled !== undefined ? filled : (state.filled?.ok ? state.filled.total : 0);
  const totalPlanned = plannedNormal + plannedOt;

  if (statFilled) {
    if (totalPlanned > 0) {
      statFilled.textContent = `${totalFilled.toFixed(1)}h (+${totalPlanned.toFixed(1)}h)`;
    } else {
      statFilled.textContent = `${totalFilled.toFixed(1)}h`;
    }
  }

  if (statGap) {
    const effectiveNormalFilled = totalFilled + plannedNormal;
    const gap = cap - effectiveNormalFilled;
    if (gap > 0.01) {
      statGap.textContent = `${t("dashboardGapRemain", "还差")} ${gap.toFixed(1)}h`;
      statGap.className = "value warn";
    } else {
      const otText = plannedOt > 0 ? ` (+${plannedOt.toFixed(1)}h加班)` : "";
      statGap.textContent = `${t("dashboardGapFull", "已填满")}${otText}`;
      statGap.className = "value ok";
    }
  }

  if (statOvertime) {
    const att = attendance !== undefined ? attendance : state.attendance;
    if (att && att.ok) {
      const otTotal = att.totalOt || 0;
      statOvertime.textContent = plannedOt > 0 ? `${otTotal.toFixed(1)}h (已排${plannedOt.toFixed(1)}h)` : `${otTotal.toFixed(1)}h`;
      statOvertime.title = `北森考勤连通成功！含 ${Object.keys(att.overtimeMap || {}).length} 天加班数据（共 ${otTotal.toFixed(1)}h）。超出考勤部分将按每日上限 +${state.cfg?.overtime_daily_max || 4}h 兜底分配`;
      statOvertime.style.color = "";
    } else {
      statOvertime.textContent = plannedOt > 0 ? `已排 ${plannedOt.toFixed(1)}h` : t("dashboardOvertimeDisabled", "未获取");
      statOvertime.title = (att && att.reason) || "无法获取考勤数据，加班将按每日上限模式分配";
      statOvertime.style.color = (att && att.ok) ? "" : "var(--color-text-secondary)";
    }
  }
}

// === 加载数据 ===

async function loadAll() {
  state.taskHours = {};
  state.overtimeHours = {};
  state.userNormalHours = {};
  state.userOvertimeHours = {};
  state.entries = [];
  state.overtimeEntries = [];
  state.submitResult = null;
  state.isSubmitting = false;
  state._transitionsLoaded = false;
  state._stage1Result = null;
  state._stage2Candidates = null;
  state._stage3Candidates = null;
  state._monthFullCandidates = null;
  state.finalStatus = null;

  setStep(1);
  mainPanel.innerHTML = `<div class="empty-state"><span class="loading"></span> ${t("dashboardLoading", "正在加载数据...")}</div>`;

  try {
    // 先检查认证状态，确保 auth_token / user_id 已就绪（必要时自动刷新 token）
    // 这一步是用浏览器 cookie 换取 API 可用的 token，是自动读取的关键环节
    const auth = await checkAuth();
    if (!auth.ok) {
      mainPanel.innerHTML = `<div class="empty-state" style="color:var(--color-danger)">${auth.reason || "未登录"}，请先在浏览器中登录 ones.reachauto.com</div>`;
      return;
    }

    const userBadge = document.getElementById("userBadge");
    if (userBadge) {
      const displayName = auth.userName || "";
      if (displayName) {
        userBadge.textContent = `👤 ${displayName}`;
        userBadge.style.display = "inline-block";
      } else {
        userBadge.style.display = "none";
      }
    }

    // 初始化月份（此时 buildCfg 会读到 checkAuth 刚写入的 token）
    const monthData = await initMonth(state.year, state.month);
    state.cfg = monthData.cfg;
    state.teamUuid = state.cfg.team_uuid || "SpBJdKsD";
    state.wdays = monthData.wdays;
    state.capacity = monthData.capacity;

    // 并行加载考勤、已填工时、任务
    const [att, filled, taskList] = await Promise.all([
      fetchAttendanceData(state.cfg, state.year, state.month, state.debug),
      fetchFilled(state.cfg, state.teamUuid, state.year, state.month, state.debug),
      fetchTaskList(state.cfg, state.teamUuid, state.debug)
    ]);

    state.attendance = att;
    state.filled = filled;
    state.tasks = taskList.tasks || [];

    // 更新摘要 Banner
    updateBannerStats({
      capacity: state.capacity,
      filled: filled.ok ? filled.total : 0,
      attendance: att
    });

    if (!att.ok) {
      showToast(`考勤组件提示: ${att.reason}`, "warning");
    }
    if (!filled.ok) {
      showToast(filled.reason || "已填工时查询失败", "error");
    }
    if (!taskList.ok) {
      showToast(taskList.reason || "未找到任务", "warning");
    }

    render();
  } catch (e) {
    mainPanel.innerHTML = `<div class="empty-state" style="color:var(--color-danger)">加载失败: ${e.message}</div>`;
  }
}

// === 步骤2：收集工时输入 ===

function collectTaskHours() {
  state.taskHours = {};
  state.overtimeHours = {};
  const inputs = mainPanel.querySelectorAll("input[data-task-uuid]");
  for (const inp of inputs) {
    const uuid = inp.dataset.taskUuid;
    const isOt = inp.dataset.overtime === "1";
    const val = parseFloat(inp.value) || 0;
    if (val > 0) {
      const task = state.tasks.find(t => t.uuid === uuid);
      const name = task ? (task._display || task.summary) : uuid;
      if (isOt) {
        state.overtimeHours[uuid] = { name, uuid, hours: val, is_overtime: true };
        state.userOvertimeHours[uuid] = val;
      } else {
        state.taskHours[uuid] = { name, uuid, hours: val };
        state.userNormalHours[uuid] = val;
      }
    } else {
      if (isOt) {
        delete state.userOvertimeHours[uuid];
      } else {
        delete state.userNormalHours[uuid];
      }
    }
  }
}

function computeDistribution() {
  const currentFilledHours = state.filled.ok ? { ...removeByKeyTask(state.filled.byDate) } : {};
  state.entries = [];
  state.overtimeEntries = [];

  // 1. 正常工时分配 (每天上限 8.0h)
  if (Object.keys(state.taskHours).length > 0) {
    const result = distributeHours(state.taskHours, state.wdays, currentFilledHours, 8.0);
    state.entries = result.entries;
    for (const e of state.entries) {
      currentFilledHours[e.date] = (currentFilledHours[e.date] || 0) + e.hours;
    }
  }

  // 2. 加班工时两阶段叠加分配
  if (Object.keys(state.overtimeHours).length > 0) {
    const otDailyMax = state.cfg.overtime_daily_max || 4;
    const hasAttendance = state.attendance && state.attendance.ok && state.attendance.overtimeMap;

    if (hasAttendance) {
      // 阶段 1：优先按考勤系统实际打卡上限分配 (每天上限 8.0 + 当天考勤加班)
      const otMap = state.attendance.overtimeMap;
      const attLimit = {};
      for (const d of state.wdays) {
        attLimit[d] = 8.0 + (otMap[d] || 0);
      }

      const attResult = distributeHours(state.overtimeHours, state.wdays, currentFilledHours, attLimit);
      state.overtimeEntries.push(...attResult.entries);
      for (const e of attResult.entries) {
        currentFilledHours[e.date] = (currentFilledHours[e.date] || 0) + e.hours;
      }

      // 计算各任务在阶段 1 已分配的考勤工时，检查是否仍有未分配完的超出部分
      const allocatedByTask = {};
      for (const e of attResult.entries) {
        allocatedByTask[e.task_uuid] = (allocatedByTask[e.task_uuid] || 0) + e.hours;
      }

      const remainingOtHours = {};
      for (const [uuid, info] of Object.entries(state.overtimeHours)) {
        const remaining = Math.round((info.hours - (allocatedByTask[uuid] || 0)) * 100) / 100;
        if (remaining > 0.001) {
          remainingOtHours[uuid] = { ...info, hours: remaining };
        }
      }

      // 阶段 2：超出考勤部分，按每天 8 + otDailyMax 兜底补满
      // 优先在无考勤加班（纯 8h）的日期上追加，超出后再补在已有考勤加班的日期上
      if (Object.keys(remainingOtHours).length > 0) {
        const fallbackLimit = 8.0 + otDailyMax;
        const prioritizedWdays = [
          ...state.wdays.filter(d => !otMap[d]),
          ...state.wdays.filter(d => !!otMap[d])
        ];
        const fbResult = distributeHours(remainingOtHours, prioritizedWdays, currentFilledHours, fallbackLimit);
        state.overtimeEntries.push(...fbResult.entries);
        for (const e of fbResult.entries) {
          currentFilledHours[e.date] = (currentFilledHours[e.date] || 0) + e.hours;
        }
      }
    } else {
      // 无考勤数据：直接按每天 8 + otDailyMax 兜底分配
      const fallbackLimit = 8.0 + otDailyMax;
      const result = distributeHours(state.overtimeHours, state.wdays, currentFilledHours, fallbackLimit);
      state.overtimeEntries = result.entries;
      for (const e of result.entries) {
        currentFilledHours[e.date] = (currentFilledHours[e.date] || 0) + e.hours;
      }
    }
    state.overtimeEntries.sort((a, b) => a.date.localeCompare(b.date));
  }
}

function removeByKeyTask(byDate) {
  const out = {};
  for (const [k, v] of Object.entries(byDate)) {
    if (k !== "_by_task") out[k] = v;
  }
  return out;
}

// === 步骤4：提交工时 ===

async function doSubmit() {
  const allEntries = [...state.entries, ...state.overtimeEntries];
  if (allEntries.length === 0) {
    state.submitResult = { ok: [], fail: [] };
    render();
    return;
  }

  state.isSubmitting = true;
  mainPanel.innerHTML = `<div class="empty-state"><span class="loading"></span> ${t("dashboardSubmitting", "正在提交")} ${allEntries.length} 条工时记录...</div>`;
  updateNextBtn();

  try {
    const result = await submitEntries(state.cfg, state.teamUuid, allEntries, state.debug);
    state.submitResult = result;
    const okHours = result.ok.reduce((s, it) => s + (it.entry?.hours || 0), 0);
    if (state.filled && typeof state.filled.total === "number") {
      state.filled.total += okHours;
    }
    const taskMap = new Map((state.tasks || []).map(t => [t.uuid, t]));
    for (const r of result.ok) {
      const tuuid = r.entry?.task_uuid;
      const hours = r.entry?.hours || 0;
      const t = taskMap.get(tuuid);
      if (t) {
        t._actual = Math.round(((t._actual || 0) + hours) * 100) / 100;
        t._remaining = Math.max(0, Math.round(((t._remaining || 0) - hours) * 100) / 100);
      }
    }
    updateBannerStats({ filled: state.filled?.total });
    showToast(`${t("dashboardSubmitDone", "提交完成：成功")} ${result.ok.length} ${t("dashboardSubmitFail", "条，失败")} ${result.fail.length}`,
              result.fail.length > 0 ? "warning" : "success");
  } catch (e) {
    console.error("Submit error:", e);
    showToast(`提交发生错误: ${e.message}`, "error");
    state.submitResult = { ok: [], fail: [{ entry: { date: "-", hours: 0, task_name: "-" }, reason: e.message }] };
  } finally {
    state.isSubmitting = false;
    render();
  }
}

// === 步骤5：状态流转 ===

async function doTransitions() {
  // 阶段1：未开始 → 进行中（自动执行，不需用户确认）
  const todoTasks = state.tasks.filter(t => t._category === "to_do");
  if (todoTasks.length > 0 && !state.dryRun) {
    state._stage1Result = await batchStatusUpdate(state.cfg, state.teamUuid, todoTasks, state.debug);
  }

  // 阶段2：进行中 → 提交审核（候选）
  const submittedByTask = {};
  if (state.submitResult) {
    for (const r of state.submitResult.ok) {
      const tuuid = r.entry.task_uuid;
      submittedByTask[tuuid] = (submittedByTask[tuuid] || 0) + r.entry.hours;
    }
  }
  const stage2Candidates = await filterStage2CandidatesAsync(state.cfg, state.tasks, state.year, state.month, submittedByTask);
  state._stage2Candidates = stage2Candidates;
  // 用户在 UI 中点击确认后再执行（见 render step5 的按钮）

  // 阶段3：完成审核中 → 已完成（候选）
  const stage3Candidates = filterStage3Candidates(state.cfg, state.tasks, state.year, state.month);
  state._stage3Candidates = stage3Candidates;

  // 阶段2b：月度已满，当月结束 → 提交审核（候选）
  const monthFullCandidates = filterMonthFullCandidates(state.cfg, state.tasks, state.year, state.month);
  state._monthFullCandidates = monthFullCandidates;
}

// === 渲染 ===

function render() {
  try {
    switch (state.step) {
      case 1: renderStep1(); break;
      case 2: renderStep2(); break;
      case 3: renderStep3(); break;
      case 4: renderStep4(); break;
      case 5: renderStep5(); break;
      case 6: renderStep6(); break;
    }
  } catch (e) {
    console.error("Render error at step", state.step, e);
    mainPanel.innerHTML = `<div class="empty-state" style="color:var(--color-danger)">
      <p><b>页面渲染发生异常</b></p>
      <p style="margin-top:8px;font-size:12px">${escapeHtml(e.message || String(e))}</p>
    </div>`;
  }
  updateNextBtn();
}

function updateNextBtn() {
  let nextLabel = t("dashboardNextBtn", "下一步");
  let nextDisabled = false;

  if (state.step === 1) {
    nextLabel = t("dashboardNextBtn", "下一步");
    nextDisabled = !state.filled;
  } else if (state.step === 2) {
    nextLabel = t("dashboardCalcBtn", "计算分配");
  } else if (state.step === 3) {
    nextLabel = state.dryRun ? t("dashboardPreviewDone", "完成预览") : t("dashboardNextBtn", "下一步");
  } else if (state.step === 4) {
    const allEntries = [...state.entries, ...state.overtimeEntries];
    if (state.isSubmitting) {
      nextLabel = t("dashboardSubmitting", "正在提交") + "...";
      nextDisabled = true;
    } else if (state.submitResult || allEntries.length === 0) {
      nextLabel = t("dashboardNextBtn", "下一步");
      nextDisabled = false;
    } else {
      nextLabel = t("dashboardConfirmSubmit", "确认提交");
      nextDisabled = false;
    }
  } else if (state.step === 5) {
    nextLabel = t("dashboardNextBtn", "下一步");
    nextDisabled = !state._transitionsLoaded;
  } else if (state.step === 6) {
    nextLabel = t("dashboardRestart", "重新开始");
  }

  btnNext.textContent = nextLabel;
  btnNext.disabled = nextDisabled;
}

function renderStep1() {
  if (!state.filled) {
    mainPanel.innerHTML = `<div class="empty-state"><span class="loading"></span> 加载中...</div>`;
    return;
  }
  const html = [];

  // 考勤状态
  html.push(`<div class="section-title">考勤系统 <span class="badge">${
    state.attendance.ok ? `已获取 ${state.attendance.totalOt || 0}h 加班` :
    "未获取（请在浏览器登录 www.italent.cn/portal）"
  }</span></div>`);

  // 已填工时状态
  html.push(`<div class="section-title">已填工时 <span class="badge">${
    state.filled.ok ? `共 ${state.filled.total.toFixed(1)}h` : "查询失败"
  }</span></div>`);

  // 任务列表预览
  if (state.tasks.length > 0) {
    html.push(`<div class="section-title">活跃任务 <span class="badge">${state.tasks.length} 个</span></div>`);
    html.push(`<div class="card"><table class="table task-table">`);
    html.push(`<thead><tr>
      <th class="col-proj">项目</th><th>任务</th><th class="col-status">状态</th>
      <th class="col-remain">剩余预计</th><th class="col-filed">本月已填</th>
    </tr></thead><tbody>`);
    for (const t of state.tasks) {
      const filed = state.filled.ok ? (state.filled.byTask[t.uuid] || 0) : 0;
      html.push(`<tr>
        <td>${escapeHtml(t._proj || "")}</td>
        <td>${escapeHtml(t.summary || "")}</td>
        <td><span class="status-badge ${t._category}">${escapeHtml(t._status_name || "")}</span></td>
        <td class="col-remain">${t._remaining > 0 ? t._remaining.toFixed(0) + "h" : "-"}</td>
        <td class="col-filed">${filed > 0 ? filed.toFixed(1) + "h" : "-"}</td>
      </tr>`);
    }
    html.push(`</tbody></table></div>`);
  } else {
    html.push(`<div class="empty-state">未找到活跃任务（检查认证或切换月份）</div>`);
  }

  mainPanel.innerHTML = html.join("");
}

function renderStep2() {
  const totalFilled = state.filled.ok ? state.filled.total : 0;
  const taskFilled = state.filled.ok ? state.filled.byTask : {};
  const monthRemain = Math.max(0, state.capacity - totalFilled);
  const defaults = calcDefaultHours(state.tasks, taskFilled, state.capacity, totalFilled);

  const otAvailable = state.attendance.ok ? (state.attendance.totalOt || 0) : 0;
  const otDailyMax = state.cfg.overtime_daily_max || 4;

  const html = [];

  // 1. 正常工时区域
  if (monthRemain < 0.01) {
    html.push(`<div class="section-title">正常工时输入 <span class="badge">月度容量已满（${state.capacity}h）</span></div>`);
    html.push(`<div class="empty-state">月度常规工时已填满，无需录入正常工时，可直接在下方录入加班工时</div>`);
  } else {
    html.push(`<div class="section-title">正常工时输入 <span class="badge">月度剩余 ${monthRemain.toFixed(1)}h</span> <span class="badge" id="badgeNormalPlanned">本次已排 0.0h</span></div>`);
    html.push(`<div class="card"><table class="table task-table">`);
    html.push(`<thead><tr>
      <th class="col-proj">项目</th><th>任务</th><th class="col-status">状态</th>
      <th class="col-remain">剩余预计</th><th class="col-filed">本月已填</th>
      <th class="col-hours">本次工时 (h)</th>
    </tr></thead><tbody>`);
    for (const t of state.tasks) {
      const def = defaults[t.uuid] || { hours: 0, filed: 0, taskRem: 0 };
      if (def.taskRem <= 0 && def.filed <= 0) continue; // 无剩余也无已填，跳过
      const userVal = state.userNormalHours[t.uuid] !== undefined ? state.userNormalHours[t.uuid] : def.hours;
      html.push(`<tr>
        <td>${escapeHtml(t._proj || "")}</td>
        <td>${escapeHtml(t.summary || "")}</td>
        <td><span class="status-badge ${t._category}">${escapeHtml(t._status_name || "")}</span></td>
        <td class="col-remain">${def.taskRem > 0 ? def.taskRem.toFixed(0) + "h" : "-"}</td>
        <td class="col-filed">${def.filed > 0 ? def.filed.toFixed(1) + "h" : "-"}</td>
        <td class="col-hours">
          <input class="input hours-input" type="number" min="0" step="0.5"
            data-task-uuid="${escapeHtml(t.uuid)}"
            value="${userVal}" placeholder="0" />
        </td>
      </tr>`);
    }
    html.push(`</tbody></table></div>`);
  }

  // 2. 加班工时区域（支持考勤优先 + 4h/天 兜底补满）
  html.push(`<div class="section-title" style="margin-top:20px">加班工时输入 ${
    otAvailable > 0
      ? `<span class="badge">考勤系统共计 ${otAvailable.toFixed(1)}h 可用</span>`
      : ""
  }<span class="badge">支持每日上限 +${otDailyMax}h 兜底补满</span> <span class="badge" id="badgeOtPlanned">本次已排 0.0h</span></div>`);

  if (state.tasks.length > 0) {
    html.push(`<div class="card"><table class="table task-table">`);
    html.push(`<thead><tr>
      <th class="col-proj">项目</th><th>任务</th><th class="col-status">状态</th>
      <th class="col-remain">剩余预计</th>
      <th class="col-hours">加班工时 (h)</th>
    </tr></thead><tbody>`);
    for (const t of state.tasks) {
      const rem = t._remaining || 0;
      const userOt = state.userOvertimeHours[t.uuid] !== undefined ? state.userOvertimeHours[t.uuid] : 0;
      html.push(`<tr>
        <td>${escapeHtml(t._proj || "")}</td>
        <td>${escapeHtml(t.summary || "")}</td>
        <td><span class="status-badge ${t._category}">${escapeHtml(t._status_name || "")}</span></td>
        <td class="col-remain">${rem > 0 ? rem.toFixed(0) + "h" : "-"}</td>
        <td class="col-hours">
          <input class="input hours-input" type="number" min="0" step="0.5"
            data-task-uuid="${escapeHtml(t.uuid)}" data-overtime="1"
            value="${userOt}" placeholder="0" />
        </td>
      </tr>`);
    }
    html.push(`</tbody></table></div>`);
  } else {
    html.push(`<div class="empty-state">未找到活跃任务</div>`);
  }

  mainPanel.innerHTML = html.join("");
  setupStep2Listeners();
}

function setupStep2Listeners() {
  const syncStep2Stats = () => {
    let totalNormal = 0;
    let totalOt = 0;
    const inputs = mainPanel.querySelectorAll("input[data-task-uuid]");
    for (const inp of inputs) {
      const uuid = inp.dataset.taskUuid;
      const isOt = inp.dataset.overtime === "1";
      const val = parseFloat(inp.value) || 0;
      if (isOt) {
        totalOt += val;
        if (val > 0) state.userOvertimeHours[uuid] = val;
        else delete state.userOvertimeHours[uuid];
      } else {
        totalNormal += val;
        if (val > 0) state.userNormalHours[uuid] = val;
        else delete state.userNormalHours[uuid];
      }
    }

    const badgeNormalPlanned = document.getElementById("badgeNormalPlanned");
    if (badgeNormalPlanned) {
      badgeNormalPlanned.textContent = `本次已排 ${totalNormal.toFixed(1)}h`;
    }
    const badgeOtPlanned = document.getElementById("badgeOtPlanned");
    if (badgeOtPlanned) {
      badgeOtPlanned.textContent = `本次已排 ${totalOt.toFixed(1)}h`;
    }

    updateBannerStats({ plannedNormal: totalNormal, plannedOt: totalOt });
  };

  mainPanel.addEventListener("input", e => {
    if (e.target && e.target.matches("input[data-task-uuid]")) {
      syncStep2Stats();
    }
  });

  // 初始进入步骤2时触发一次统计更新
  syncStep2Stats();
}

function renderStep3() {
  const allEntries = [...state.entries, ...state.overtimeEntries];
  const otPlanned = state.overtimeEntries.reduce((a, e) => a + e.hours, 0);
  const newPlanned = state.entries.reduce((a, e) => a + e.hours, 0);

  const filledDateMap = state.filled.ok ? removeByKeyTask(state.filled.byDate) : {};
  const totalFilled = state.filled.ok ? state.filled.total : 0;
  const totalAfter = totalFilled + newPlanned + otPlanned;

  updateBannerStats({ plannedNormal: newPlanned, plannedOt: otPlanned });

  const html = [];
  html.push(`<div class="section-title">分配预览 <span class="badge">本次新增 ${newPlanned.toFixed(1)}h${
    otPlanned > 0 ? ` + 加班 ${otPlanned.toFixed(1)}h` : ""
  }，提交后 ${totalAfter.toFixed(1)}h / ${state.capacity}h</span></div>`);

  // 日历视图
  html.push(`<div class="card calendar-card">`);
  html.push(`<div class="calendar-legend">
    <div class="legend-item"><span class="legend-swatch" style="background:white"></span>未填</div>
    <div class="legend-item"><span class="legend-swatch" style="background:#FFF7E8"></span>部分</div>
    <div class="legend-item"><span class="legend-swatch" style="background:#E8FFEA"></span>已满</div>
    <div class="legend-item"><span class="legend-swatch" style="background:#F7F8FA"></span>非工作日</div>
  </div>`);

  // 构造当月日历
  const newByDay = {};
  for (const e of allEntries) {
    if (!newByDay[e.date]) newByDay[e.date] = [];
    newByDay[e.date].push(e);
  }
  const firstDay = new Date(state.year, state.month - 1, 1);
  const lastDay = new Date(state.year, state.month, 0).getDate();
  const startWeekday = firstDay.getDay(); // 0=周日
  const todayStr = dateToStr(new Date());

  html.push(`<div class="calendar-grid">`);
  const weekHeaders = ["日", "一", "二", "三", "四", "五", "六"];
  for (const w of weekHeaders) {
    html.push(`<div class="calendar-cell" style="background:#F7F8FA;text-align:center;font-weight:600;color:var(--color-text-secondary)">${w}</div>`);
  }
  // 前置空格
  for (let i = 0; i < startWeekday; i++) {
    html.push(`<div class="calendar-cell empty"></div>`);
  }
  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${state.year}-${pad2(state.month)}-${pad2(day)}`;
    const wd = new Date(state.year, state.month - 1, day).getDay();
    const isWeekend = wd === 0 || wd === 6;
    const isWorkday = state.wdays.includes(dateStr);
    const already = filledDateMap[dateStr] || 0;
    const adding = (newByDay[dateStr] || []).reduce((a, e) => a + e.hours, 0);
    const total = already + adding;
    const taskNames = (newByDay[dateStr] || []).map(e => e.task_name.slice(0, 12)).join(",");

    let cls = "calendar-cell";
    if (!isWorkday) cls += isWeekend ? "" : " off";
    else if (isWeekend) cls += " weekend";
    if (dateStr === todayStr) cls += " today";
    if (isWorkday) {
      if (total >= 8 - 0.01) cls += " full";
      else if (total > 0) cls += " partial";
    }

    html.push(`<div class="${cls}">
      <div class="date-num">${day}</div>
      ${isWorkday ? `<div class="hours">${already.toFixed(1)}h${adding > 0 ? ` +${adding.toFixed(1)}h` : ""}</div>` : ""}
      ${taskNames ? `<div class="task-name" title="${escapeHtml(taskNames)}">${escapeHtml(taskNames)}</div>` : ""}
    </div>`);
  }
  html.push(`</div></div>`);

  // 明细列表
  if (allEntries.length > 0) {
    html.push(`<div class="section-title">工时明细 <span class="badge">${allEntries.length} 条</span></div>`);
    html.push(`<div class="card"><table class="table">`);
    html.push(`<thead><tr><th style="width:120px">日期</th><th style="width:60px">星期</th><th style="width:80px;text-align:right">工时</th><th>任务</th>${state.debug ? "<th>UUID</th>" : ""}</tr></thead><tbody>`);
    for (const e of allEntries) {
      html.push(`<tr>
        <td>${e.date}</td>
        <td>${weekdayName(e.date)}</td>
        <td style="text-align:right">${e.hours.toFixed(1)}h${e.is_overtime ? ' <span class="tag tag-warning">加班</span>' : ""}</td>
        <td>${escapeHtml(e.task_name)}</td>
        ${state.debug ? `<td style="font-family:monospace;font-size:11px;color:var(--color-info)">${escapeHtml(e.task_uuid)}</td>` : ""}
      </tr>`);
    }
    html.push(`</tbody></table></div>`);
  }

  mainPanel.innerHTML = html.join("");
}

function renderStep4() {
  if (state.isSubmitting) {
    const allEntries = [...state.entries, ...state.overtimeEntries];
    mainPanel.innerHTML = `<div class="empty-state"><span class="loading"></span> ${t("dashboardSubmitting", "正在提交")} ${allEntries.length} 条工时记录...</div>`;
    return;
  }
  if (state.submitResult) {
    renderSubmitLog();
    return;
  }
  const allEntries = [...state.entries, ...state.overtimeEntries];
  const total = allEntries.reduce((a, e) => a + e.hours, 0);
  if (allEntries.length === 0) {
    mainPanel.innerHTML = `<div class="empty-state">
      <p>未输入工时记录，无需提交</p>
      <p style="margin-top:8px;color:var(--color-text-secondary)">点击右下角"下一步"继续</p>
    </div>`;
    return;
  }
  mainPanel.innerHTML = `<div class="empty-state">
    <p>即将提交 <b>${allEntries.length}</b> 条工时记录，共 <b>${total.toFixed(1)}h</b></p>
    <p style="margin-top:8px;color:var(--color-text-secondary)">点击右下角"确认提交"开始</p>
  </div>`;
}

function renderSubmitLog() {
  const r = state.submitResult;
  const html = [];
  html.push(`<div class="section-title">提交日志 <span class="badge">成功 ${r.ok.length} / 失败 ${r.fail.length}</span></div>`);
  html.push(`<div class="submit-log">`);
  for (const item of r.ok) {
    html.push(`<div class="ok">✓ ${item.entry.date}  ${item.entry.hours.toFixed(1)}h  ${escapeHtml(item.entry.task_name.slice(0, 40))}</div>`);
  }
  for (const item of r.fail) {
    html.push(`<div class="fail">✗ ${item.entry.date}  ${item.entry.hours.toFixed(1)}h  ${escapeHtml(item.entry.task_name.slice(0, 40))}  (${escapeHtml(item.reason)})</div>`);
  }
  html.push(`</div>`);
  mainPanel.innerHTML = html.join("");
}

async function renderStep5() {
  if (!state._transitionsLoaded) {
    mainPanel.innerHTML = `<div class="empty-state"><span class="loading"></span> 正在计算状态流转候选...</div>`;
    btnNext.disabled = true;
    try {
      await doTransitions();
    } catch (e) {
      console.error("Transitions load error:", e);
      showToast("流转数据计算失败: " + e.message, "error");
    } finally {
      state._transitionsLoaded = true;
      updateNextBtn();
      renderStep5();
    }
    return;
  }

  const html = [];

  // 阶段1结果
  if (state._stage1Result) {
    const r = state._stage1Result;
    html.push(`<div class="section-title">阶段1：未开始 → 进行中 <span class="badge">更新 ${r.updated.length} / 失败 ${r.failed.length} / 跳过 ${r.skipped.length}</span></div>`);
    if (r.updated.length > 0 || r.failed.length > 0) {
      html.push(`<div class="card transition-candidates"><table class="table"><tbody>`);
      for (const u of r.updated) html.push(`<tr><td><span class="tag tag-success">✓</span></td><td>${escapeHtml(u.task._display || u.task.summary)}</td><td>→ ${escapeHtml(u.toStatus)}</td></tr>`);
      for (const f of r.failed) html.push(`<tr><td><span class="tag tag-danger">✗</span></td><td>${escapeHtml(f.task._display || f.task.summary)}</td><td>${escapeHtml(f.reason)}</td></tr>`);
      html.push(`</tbody></table></div>`);
    }
  }

  // 阶段2：进行中 → 提交审核
  const stage2 = state._stage2Candidates || [];
  html.push(`<div class="section-title">阶段2：进行中 → 提交审核 <span class="badge">${stage2.length} 个候选</span></div>`);
  if (stage2.length > 0) {
    html.push(renderTransitionTable(stage2, "stage2"));
    html.push(`<button class="btn-primary btn-sm" id="btnExecStage2" style="margin-top:8px">执行阶段2流转</button>`);
  } else {
    html.push(`<div class="empty-state">无可流转任务</div>`);
  }

  // 阶段3：完成审核中 → 已完成
  const stage3 = state._stage3Candidates || [];
  if (stage3.length > 0) {
    html.push(`<div class="section-title">阶段3：完成审核中 → 已完成 <span class="badge">${stage3.length} 个候选</span></div>`);
    html.push(renderTransitionTable(stage3, "stage3"));
    html.push(`<button class="btn-primary btn-sm" id="btnExecStage3" style="margin-top:8px">执行阶段3流转</button>`);
  }

  // 阶段2b：月度已满
  const monthFull = state._monthFullCandidates || [];
  if (monthFull.length > 0) {
    html.push(`<div class="section-title">阶段2b：月度已满，当月结束 → 提交审核 <span class="badge">${monthFull.length} 个候选</span></div>`);
    html.push(renderTransitionTable(monthFull, "monthFull"));
    html.push(`<button class="btn-secondary btn-sm" id="btnExecMonthFull" style="margin-top:8px">执行月满流转</button>`);
  }

  mainPanel.innerHTML = html.join("");

  // 绑定按钮
  const btnS2 = document.getElementById("btnExecStage2");
  if (btnS2) btnS2.addEventListener("click", () => execTransitionBatch("stage2"));
  const btnS3 = document.getElementById("btnExecStage3");
  if (btnS3) btnS3.addEventListener("click", () => execTransitionBatch("stage3"));
  const btnMF = document.getElementById("btnExecMonthFull");
  if (btnMF) btnMF.addEventListener("click", () => execTransitionBatch("monthFull"));
}

function renderTransitionTable(tasks, kind) {
  const html = [`<div class="card transition-candidates"><table class="table"><thead><tr>
    <th>项目</th><th>任务</th><th>状态</th><th>类型</th>
    <th style="width:90px">计划开始</th><th style="width:90px">计划结束</th>
    <th style="width:100px;text-align:right">已填/预估</th><th>流转到</th>
  </tr></thead><tbody>`];
  for (const t of tasks) {
    const step = findStep(state.cfg, t);
    const hours = t._estimated > 0 ? `${t._actual.toFixed(0)}h/${t._estimated.toFixed(0)}h` : `${t._actual.toFixed(0)}h/-`;
    html.push(`<tr>
      <td>${escapeHtml(t._proj || "")}</td>
      <td>${escapeHtml(t.summary || "")}</td>
      <td><span class="status-badge ${t._category}">${escapeHtml(t._status_name || "")}</span></td>
      <td>${escapeHtml(t._issue_type || "")}</td>
      <td>${escapeHtml((t._plan_start || "").slice(0, 10) || "-")}</td>
      <td>${escapeHtml((t._plan_end || "").slice(0, 10) || "-")}</td>
      <td style="text-align:right">${hours}</td>
      <td>${step ? `→ ${escapeHtml(step.to_status)}` : "-"}</td>
    </tr>`);
  }
  html.push(`</tbody></table></div>`);
  return html.join("");
}

async function execTransitionBatch(kind) {
  let candidates;
  if (kind === "stage2") candidates = state._stage2Candidates;
  else if (kind === "stage3") candidates = state._stage3Candidates;
  else if (kind === "monthFull") candidates = state._monthFullCandidates;
  if (!candidates || !candidates.length) return;

  if (!confirm(`${t("dashboardExecTransition", "确认执行")} ${candidates.length} ${t("dashboardTasksTransition", "个任务的状态流转？")}`)) return;

  showToast(t("dashboardTransitionRunning", "正在执行流转..."), "info");
  const result = await batchStatusUpdate(state.cfg, state.teamUuid, candidates, state.debug);
  showToast(`${t("dashboardTransitionDone", "流转完成：成功")} ${result.updated.length}，${t("dashboardSubmitFail", "失败")} ${result.failed.length}`,
            result.failed.length > 0 ? "warning" : "success");

  // 从候选列表中移除已处理的
  if (kind === "stage2") state._stage2Candidates = [];
  else if (kind === "stage3") state._stage3Candidates = [];
  else if (kind === "monthFull") state._monthFullCandidates = [];

  // 保存结果用于展示
  state[`_result_${kind}`] = result;
  renderStep5();
}

function renderStep6() {
  // 显示最终汇总
  const html = [];
  html.push(`<div class="section-title">最终状态</div>`);

  if (!state.filled.ok) {
    html.push(`<div class="empty-state">无法获取最终状态</div>`);
    mainPanel.innerHTML = html.join("");
    return;
  }

  // 刷新数据
  refreshFinalStatus(state.cfg, state.teamUuid, state.year, state.month, state.wdays, state.capacity, state.tasks, state.debug)
    .then(r => {
      state.finalStatus = r;
      if (!r.ok) {
        mainPanel.innerHTML = `<div class="empty-state">刷新失败</div>`;
        return;
      }
      if (state.filled) {
        state.filled.total = r.total;
      }
      updateBannerStats({ filled: r.total });
      const gap = state.capacity - r.total;
      html.push(`<div class="card"><table class="table"><thead><tr>
        <th>项目</th><th>任务</th><th>状态</th>
        <th style="text-align:right">本月已填</th><th style="text-align:right">任务剩余</th>
      </tr></thead><tbody>`);
      for (const row of r.rows) {
        html.push(`<tr>
          <td>${escapeHtml(row.proj)}</td>
          <td>${escapeHtml(row.summary)}</td>
          <td><span class="status-badge ${row.isActive ? "in_progress" : "done"}">${escapeHtml(row.status)}</span></td>
          <td style="text-align:right">${row.filed.toFixed(1)}h</td>
          <td style="text-align:right">${row.taskRem > 0 ? row.taskRem.toFixed(0) + "h" : "-"}</td>
        </tr>`);
      }
      html.push(`</tbody></table>`);
      html.push(`<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--color-border);text-align:right">
        合计: ${r.total.toFixed(1)}h / ${state.capacity}h
        <span class="${gap > 0.01 ? "tag tag-warning" : "tag tag-success"}" style="margin-left:8px">
          ${gap > 0.01 ? `还差 ${gap.toFixed(1)}h` : "已填满"}
        </span>
      </div></div>`);

      html.push(`<div class="empty-state" style="margin-top:20px">✓ ${t("dashboardAllDone", "全部流程已完成")}</div>`);
      mainPanel.innerHTML = html.join("");
    });
}

// === 工具 ===

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function showToast(msg, type = "") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// === 启动 ===
loadAll();
