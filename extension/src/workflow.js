// workflow.js — 工作流配置解析与状态流转过滤（移植自 Python _parse_workflow 等）

const DEFAULT_WORKFLOW = {
  "任务": [
    { status: "未开始", button: "开始任务" },
    { status: "进行中", button: "完成任务", comment: "已经完成啦" },
    { status: "已完成" }
  ],
  "工作任务": [
    { status: "未开始",     button: "开始任务" },
    { status: "进行中",     button: "完成审核中", comment: "已经完成啦" },
    { status: "完成审核中", button: "已完成", comment: "已经完成啦" },
    { status: "已完成" }
  ]
};

// 解析 workflow 配置：返回 {类型名: [{from_status, to_status, button, comment}, ...]}
export function parseWorkflow(cfg) {
  let raw = cfg && cfg.workflow;
  if (!raw || typeof raw !== "object") raw = DEFAULT_WORKFLOW;
  const globalComment = (cfg && cfg.transition_comment) || "";
  const result = {};

  for (const [typeName, rawSteps] of Object.entries(raw)) {
    if (!Array.isArray(rawSteps) || rawSteps.length < 2) continue;
    const steps = [];
    for (let i = 0; i < rawSteps.length - 1; i++) {
      const cur = rawSteps[i];
      const nxt = rawSteps[i + 1];
      if (!cur || typeof cur !== "object" || !nxt || typeof nxt !== "object") continue;
      const button = cur.button || "";
      if (!button) continue;
      steps.push({
        from_status: cur.status || "",
        to_status: nxt.status || "",
        button,
        comment: cur.comment !== undefined ? cur.comment : globalComment
      });
    }
    if (steps.length) result[typeName] = steps;
  }
  return result;
}

// 根据任务的工作项类型和当前状态找到匹配的流转步骤
export function findStep(cfg, task) {
  const wf = parseWorkflow(cfg);
  if (!wf || Object.keys(wf).length === 0) return null;
  const issueType = task._issue_type || "";
  const statusName = task._status_name || "";
  let steps = wf[issueType];
  if (!steps) steps = Object.values(wf)[0]; // 兜底：第一个类型
  for (const step of steps) {
    if (step.from_status && step.from_status.includes(statusName)) return step;
    // Python 用的是 "in" 判断（status_name 是否包含 from_status），这里反向兼容
    if (step.from_status && statusName.includes(step.from_status)) return step;
  }
  return null;
}

// 判断当前任务是否处于该类型 workflow 的最后一步
export function isLastStep(cfg, task) {
  if (!task || !task._issue_type) return false;
  const wf = parseWorkflow(cfg);
  if (!wf) return false;
  const steps = wf[task._issue_type];
  if (!steps || !steps.length) return false;
  const step = findStep(cfg, task);
  if (!step) return false;
  const last = steps[steps.length - 1];
  return step.from_status === last.from_status &&
         step.to_status === last.to_status &&
         step.button === last.button;
}

// 月度已满时的补充检查：任务当月结束且仍有剩余预估工时
export function eligibleForMonthFullClose(task, year, month) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthLast = new Date(year, month, 0);
  const pe = (task._plan_end || "").slice(0, 10);
  if (!pe) return false;
  const endDate = new Date(pe);
  if (isNaN(endDate.getTime())) return false;
  endDate.setHours(0, 0, 0, 0);
  if (endDate > monthLast || endDate < today) return false;
  return (task._remaining || 0) > 0.1;
}

// 阶段2和阶段3共用的三条过滤规则
export function eligibleForUpdate(task, year, month, extraSubmittedHours = 0) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthLast = new Date(year, month, 0);

  const pe = (task._plan_end || "").slice(0, 10);
  if (pe) {
    const endDate = new Date(pe);
    if (!isNaN(endDate.getTime())) {
      endDate.setHours(0, 0, 0, 0);
      if (endDate > monthLast) return false;
      if (endDate < today) return false;
    }
  }

  const est = task._estimated || 0;
  if (est > 0) {
    const act = (task._actual || 0) + extraSubmittedHours;
    if (act < est - 0.1) return false;
  }
  return true;
}
