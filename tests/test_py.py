#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Unit tests for ones_timefiller.py CLI logic"""

import datetime
import unittest
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import ones_timefiller as ot


class TestHolidays(unittest.TestCase):
    def test_holidays_2025(self):
        off, on = ot._holiday_sets(2025)
        self.assertIn("2025-01-01", off)
        self.assertIn("2025-01-26", on)

    def test_working_days(self):
        wdays_3 = ot.working_days(2025, 3)
        self.assertEqual(len(wdays_3), 21)


class TestDistribute(unittest.TestCase):
    def test_single_task(self):
        tasks = {"t1": {"name": "Task 1", "hours": 8.0}}
        wdays = [datetime.date(2025, 3, 3), datetime.date(2025, 3, 4)]
        entries, remain = ot.distribute(tasks, wdays, {})
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["hours"], 8.0)
        self.assertEqual(entries[0]["date"], datetime.date(2025, 3, 3))

    def test_multi_day_task(self):
        tasks = {"t1": {"name": "Task 1", "hours": 12.0}}
        wdays = [datetime.date(2025, 3, 3), datetime.date(2025, 3, 4)]
        entries, remain = ot.distribute(tasks, wdays, {})
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0]["hours"], 8.0)
        self.assertEqual(entries[1]["hours"], 4.0)

    def test_overtime_daily_limit_object(self):
        tasks = {"t1": {"name": "Task 1", "hours": 10.0, "is_overtime": True}}
        wdays = [datetime.date(2025, 3, 3), datetime.date(2025, 3, 4)]
        daily_limit = {datetime.date(2025, 3, 3): 12.0, datetime.date(2025, 3, 4): 8.0}
        entries, remain = ot.distribute(tasks, wdays, {}, daily_limit=daily_limit)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["hours"], 10.0)

    def test_overtime_two_phase_prioritization(self):
        wdays = [
            datetime.date(2025, 3, 3),  # D1 (考勤 1h)
            datetime.date(2025, 3, 4),  # D2 (考勤 5h)
            datetime.date(2025, 3, 5),  # D3 (纯8h)
            datetime.date(2025, 3, 6),  # D4 (纯8h)
            datetime.date(2025, 3, 7),  # D5 (纯8h)
        ]
        attendance_ot = {wdays[0]: 1.0, wdays[1]: 5.0}
        current_filled = {d: 8.0 for d in wdays}

        # 阶段 1：按考勤分配 6h
        ot_att_hours = {"t1": {"name": "T1", "hours": 6.0, "is_overtime": True}}
        att_entries, _ = ot.distribute(
            ot_att_hours, wdays, current_filled,
            daily_limit={d: 8.0 + attendance_ot.get(d, 0) for d in wdays}
        )
        self.assertEqual(len(att_entries), 2)
        self.assertEqual(att_entries[0]["hours"], 1.0)
        self.assertEqual(att_entries[1]["hours"], 5.0)
        for e in att_entries:
            current_filled[e["date"]] += e["hours"]

        # 阶段 2：追加 10h 补充加班，优先在纯 8h 日期分配
        wdays_prioritized = [d for d in wdays if attendance_ot.get(d, 0) == 0] + \
                            [d for d in wdays if attendance_ot.get(d, 0) > 0]
        ot_4h_hours = {"t1": {"name": "T1", "hours": 10.0, "is_overtime": True}}
        ot_4h_entries, _ = ot.distribute(
            ot_4h_hours, wdays_prioritized, current_filled,
            daily_limit=12.0
        )
        for e in ot_4h_entries:
            current_filled[e["date"]] += e["hours"]

        all_ot_entries = sorted(att_entries + ot_4h_entries, key=lambda e: e["date"])
        ot_by_date = {e["date"]: e["hours"] for e in all_ot_entries}

        # 验证加班结果为 1 / 5 / 4 / 4 / 2
        self.assertEqual(ot_by_date[wdays[0]], 1.0)
        self.assertEqual(ot_by_date[wdays[1]], 5.0)
        self.assertEqual(ot_by_date[wdays[2]], 4.0)
        self.assertEqual(ot_by_date[wdays[3]], 4.0)
        self.assertEqual(ot_by_date[wdays[4]], 2.0)


class TestWorkflow(unittest.TestCase):
    def test_parse_workflow(self):
        wf = ot._parse_workflow({})
        self.assertIn("任务", wf)
        self.assertIn("工作任务", wf)
        self.assertEqual(len(wf["任务"]), 2)

    def test_find_step(self):
        step = ot._find_step({}, {"_issue_type": "任务", "_status_name": "未开始"})
        self.assertIsNotNone(step)
        self.assertEqual(step["button"], "开始任务")
        self.assertEqual(step["to_status"], "进行中")

    def test_is_last_step(self):
        self.assertTrue(ot._is_last_step({}, {"_issue_type": "任务", "_status_name": "进行中"}))
        self.assertFalse(ot._is_last_step({}, {"_issue_type": "任务", "_status_name": "未开始"}))

    def test_eligible_for_month_full_close(self):
        today = datetime.date.today()
        task = {"_plan_end": today.isoformat(), "_remaining": 5.0}
        self.assertTrue(ot._eligible_for_month_full_close(task, today.year, today.month))

    def test_eligible_for_update_after_actual_update(self):
        today = datetime.date.today()
        task = {
            "uuid": "task_1",
            "_plan_end": today.isoformat(),
            "_estimated": 48.0,
            "_actual": 43.0,
            "_remaining": 5.0,
        }
        self.assertFalse(ot._eligible_for_update(task, today.year, today.month))
        # Simulate submitting 5h
        submitted_hours = 5.0
        task["_actual"] = round(task["_actual"] + submitted_hours, 2)
        task["_remaining"] = max(0.0, round(task["_remaining"] - submitted_hours, 2))
        self.assertEqual(task["_actual"], 48.0)
        self.assertEqual(task["_remaining"], 0.0)
        self.assertTrue(ot._eligible_for_update(task, today.year, today.month))


class TestAttendance(unittest.TestCase):
    def test_parse_italent_attendance(self):
        data = {
            "biz_data": [
                {"SwipingCardDate": {"value": "2025-03-15"}, "WorkPeriod": {"value": "11"}, "DateType": {"text": "工作日"}},
                {"SwipingCardDate": {"value": "2025-03-16"}, "WorkPeriod": {"value": "6"}, "DateType": {"text": "公休日"}},
                {"SwipingCardDate": {"value": "2025-03-17"}, "WorkPeriod": {"value": "9"}, "DateType": {"text": "工作日"}},
            ]
        }
        ot_map = ot.parse_italent_attendance(data, 2025, 3, cfg={"italent_standard_work_hours": 9})
        self.assertEqual(ot_map.get(datetime.date(2025, 3, 15)), 2)
        self.assertEqual(ot_map.get(datetime.date(2025, 3, 16)), 6)
        self.assertNotIn(datetime.date(2025, 3, 17), ot_map)


class TestConfig(unittest.TestCase):
    def test_default_config_fields(self):
        self.assertIn("user_id", ot.DEFAULT_CONFIG)
        self.assertIn("auth_token", ot.DEFAULT_CONFIG)
        self.assertIn("team_uuid", ot.DEFAULT_CONFIG)
        self.assertIn("org_uuid", ot.DEFAULT_CONFIG)
        self.assertIn("workflow", ot.DEFAULT_CONFIG)
        self.assertIn("extra_holidays", ot.DEFAULT_CONFIG)
        self.assertEqual(ot.DEFAULT_CONFIG["team_uuid"], "SpBJdKsD")

    def test_save_config_creates_dir(self):
        import tempfile
        import shutil
        import json

        temp_dir = Path(tempfile.mkdtemp())
        test_cfg_dir = temp_dir / "nested" / "dir" / ".ones-helper"
        test_cfg_file = test_cfg_dir / "config.json"

        orig_dir = ot._USER_CFG_DIR
        orig_file = ot._USER_CFG_FILE
        try:
            ot._USER_CFG_DIR = test_cfg_dir
            ot._USER_CFG_FILE = test_cfg_file

            self.assertFalse(test_cfg_dir.exists())
            success = ot._save_config({"auth_token": "test_token_123", "user_id": "test_uid"})
            self.assertTrue(success)
            self.assertTrue(test_cfg_file.exists())

            with open(test_cfg_file, "r", encoding="utf-8") as f:
                saved = json.load(f)
            self.assertEqual(saved["auth_token"], "test_token_123")
            self.assertEqual(saved["user_id"], "test_uid")
            self.assertEqual(saved["team_uuid"], "SpBJdKsD")
            self.assertIn("workflow", saved)
        finally:
            ot._USER_CFG_DIR = orig_dir
            ot._USER_CFG_FILE = orig_file
            shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()

