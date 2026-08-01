// distribute.js — 工时分配算法（移植自 Python distribute）

// task_hours: { uuid: {name, uuid, hours, is_overtime?} }
// wdays: ["YYYY-MM-DD", ...]  工作日字符串数组
// filled_hours: {dateStr: hours}  已填工时
// daily_limit: 数字 或 {dateStr: limitHours}
// 返回 { entries: [...], remaining: {dateStr: remaining} }
export function distribute(taskHours, wdays, filledHours, dailyLimit = 8.0) {
  const remaining = {};
  for (const d of wdays) {
    // 注意：当 dailyLimit 是按日期映射的对象时，0 也是合法上限（不能 || 8.0）
    const limit = typeof dailyLimit === "object"
      ? (Object.prototype.hasOwnProperty.call(dailyLimit, d) ? dailyLimit[d] : 8.0)
      : dailyLimit;
    const avail = limit - (filledHours[d] || 0.0);
    if (avail > 0.001) remaining[d] = avail;
  }

  const openDays = Object.keys(remaining).sort();
  const entries = [];
  let dayIdx = 0;

  for (const info of Object.values(taskHours)) {
    let left = info.hours;
    while (left > 0.001) {
      if (dayIdx >= openDays.length) {
        console.warn(`  ! 任务 '${info.name.slice(0, 30)}' 剩余 ${left.toFixed(1)}h 无法分配（工作日不足）`);
        break;
      }
      const d = openDays[dayIdx];
      const fill = Math.min(left, remaining[d]);
      remaining[d] -= fill;
      left -= fill;
      entries.push({
        task_uuid: info.uuid,
        task_name: info.name,
        date: d,
        hours: Math.round(fill * 100) / 100,
        is_overtime: info.is_overtime || false
      });
      if (remaining[d] < 0.001) dayIdx++;
    }
  }

  return { entries, remaining };
}
