# ones-helper

ONES 工时自动填写工具，适用于 ones.reachauto.com。

## 功能

- 自动查询本月已填工时，展示哪几天已满、哪几天有剩余
- 查询你负责的未完成任务（跨项目，过滤已完成）
- 按任务剩余预计工时作为默认值，按工作日自动分配
- 月度工时满后支持追加加班工时（可配置每天上限）
- 任务状态自动流转：未开始→进行中→完成审核中→已完成
- 内置 2025 官方节假日 + 2026 估算节假日（含补班日）
- Token 过期自动提示，支持运行时粘贴更新

## 快速开始

```bash
# 1. 复制配置文件
cp config.example.json config.json

# 2. 填入认证信息（见下方说明）
# 编辑 config.json

# 3. 运行
run.bat              # 填写本月工时
run.bat --dry-run    # 仅预览，不提交
run.bat -m 2026-04   # 填写指定月份
run.bat --debug      # 显示 API 调试信息
```

## 获取认证信息

浏览器访问 ones.reachauto.com（保持登录状态）

**F12 → Application → Cookies → ones.reachauto.com**

| config 字段    | Cookie 名称     | 说明                          |
|--------------|----------------|-------------------------------|
| `auth_token` | `ones-lt`      | JWT 令牌，约 1 小时过期          |
| `session_id` | `ones-ids-sid` | Session ID，有效期数月           |
| `user_id`    | —              | 从 JWT 自动解析，无需手动填写       |

## 配置说明

参见 `config.example.json`，支持以下可选配置：

- `overtime_daily_max`：加班模式每天最多额外小时数（默认 4h）
- `extra_holidays`：自定义节假日补丁（off/on/remove_off/remove_on）

## 依赖

Python 3.8+，无需安装第三方库（纯标准库实现）。
