import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

STORE_DIR = r"c:\Users\duyin\Desktop\ones-helper\store"
LOGO_PATH = os.path.join(STORE_DIR, "logo_master.png")

# Font paths
FONT_MAIN = r"C:\Windows\Fonts\msyh.ttc"
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"

def get_font(size, bold=False):
    path = FONT_BOLD if bold else FONT_MAIN
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

def draw_rounded_rect(draw, xy, radius, fill=None, outline=None, width=1):
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle([x1, y1, x2, y2], radius=radius, fill=fill, outline=outline, width=width)

def generate_promo_small():
    width, height = 440, 280
    img = Image.new("RGBA", (width, height), (15, 23, 42, 255)) # Dark navy #0F172A
    draw = ImageDraw.Draw(img)

    # Background ambient radial glow
    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse([20, 20, 240, 240], fill=(14, 165, 233, 40)) # cyan glow
    glow_draw.ellipse([220, 80, 420, 260], fill=(99, 102, 241, 30)) # indigo glow
    glow = glow.filter(ImageFilter.GaussianBlur(30))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)

    # Outer border line
    draw_rounded_rect(draw, (8, 8, width-8, height-8), radius=12, fill=None, outline=(51, 65, 85, 255), width=1)

    # Logo
    if os.path.exists(LOGO_PATH):
        logo = Image.open(LOGO_PATH).convert("RGBA")
        logo_resized = logo.resize((72, 72), Image.Resampling.LANCZOS)
        img.paste(logo_resized, (32, 32), logo_resized)

    # Title & Subtitle
    font_title = get_font(22, bold=True)
    font_sub = get_font(13, bold=True)
    font_tag = get_font(12, bold=False)

    draw.text((120, 32), "ONES 工时助手", font=font_title, fill=(255, 255, 255, 255))
    draw.text((120, 62), "ONES Hours Helper", font=font_sub, fill=(56, 189, 248, 255))
    draw.text((120, 82), "智能工时规划 · 自动一键流转", font=font_tag, fill=(148, 163, 184, 255))

    # Divider line
    draw.line([(32, 116), (width - 32, 116)], fill=(51, 65, 85, 255), width=1)

    # Feature badges
    features = [
        ("⚡ 零 Cookie 复制", "自动读取浏览器登录态", (14, 165, 233, 30), (56, 189, 248, 255)),
        ("📅 智能日历分配", "精准识别未填与加班工时", (16, 185, 129, 30), (52, 211, 153, 255)),
        ("🔄 自动状态流转", "任务状态一键三连流转", (129, 140, 248, 30), (165, 180, 252, 255))
    ]

    y_offset = 128
    font_badge_title = get_font(12, bold=True)
    font_badge_desc = get_font(11, bold=False)

    for title, desc, bg_color, text_color in features:
        draw_rounded_rect(draw, (32, y_offset, width - 32, y_offset + 42), radius=8, fill=bg_color, outline=(51, 65, 85, 180), width=1)
        draw.text((44, y_offset + 6), title, font=font_badge_title, fill=text_color)
        draw.text((44, y_offset + 22), desc, font=font_badge_desc, fill=(203, 213, 225, 255))
        y_offset += 46

    out_path = os.path.join(STORE_DIR, "promo_small_440x280.png")
    img.save(out_path)
    print(f"Generated: {out_path}")

def generate_promo_large():
    width, height = 1400, 560
    img = Image.new("RGBA", (width, height), (11, 15, 25, 255)) # Dark navy background
    draw = ImageDraw.Draw(img)

    # Glowing background elements
    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse([50, 50, 550, 500], fill=(14, 165, 233, 35)) # cyan ambient
    glow_draw.ellipse([800, -100, 1500, 600], fill=(99, 102, 241, 35)) # indigo ambient
    glow = glow.filter(ImageFilter.GaussianBlur(60))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)

    # Grid background pattern
    grid_color = (30, 41, 59, 120)
    for x in range(0, width, 40):
        draw.line([(x, 0), (x, height)], fill=grid_color, width=1)
    for y in range(0, height, 40):
        draw.line([(0, y), (width, y)], fill=grid_color, width=1)

    # Left Column: Branding & Highlights
    # Top Tag
    draw_rounded_rect(draw, (60, 48, 280, 80), radius=16, fill=(14, 165, 233, 40), outline=(56, 189, 248, 255), width=1)
    draw.text((76, 56), "Microsoft Edge Add-ons", font=get_font(13, bold=True), fill=(56, 189, 248, 255))

    # Logo + Title
    if os.path.exists(LOGO_PATH):
        logo = Image.open(LOGO_PATH).convert("RGBA")
        logo_resized = logo.resize((84, 84), Image.Resampling.LANCZOS)
        img.paste(logo_resized, (60, 104), logo_resized)

    draw.text((160, 108), "ONES 工时助手", font=get_font(38, bold=True), fill=(255, 255, 255, 255))
    draw.text((160, 156), "ONES Hours Helper · 智能工时提交与状态流转面板", font=get_font(16, bold=True), fill=(56, 189, 248, 255))

    # Bullets
    bullets = [
        ("⚡ 零 Cookie 复制", "基于 fetch + credentials: include，自动读取浏览器登录态，VPN/隐私模式全支持"),
        ("🗓️ 6 步独立面板", "一键加载活跃任务，智能日历工时分配，支持加班工时与每日上限调节"),
        ("🔄 自动状态流转", "未开始 ➔ 进行中 ➔ 完成审核中 ➔ 已完成，全流程自动化无需人工逐个修改"),
        ("💼 北森考勤联动", "可选集成北森考勤 API，自动识别实际考勤出勤与加班工时，精准匹配"),
        ("🔒 100% 本地安全", "所有数据均在浏览器本地处理，绝不下发或上传任何个人数据，代码开源审计")
    ]

    y_offset = 205
    for title, desc in bullets:
        draw_rounded_rect(draw, (60, y_offset, 590, y_offset + 56), radius=10, fill=(30, 41, 59, 160), outline=(51, 65, 85, 200), width=1)
        draw.text((76, y_offset + 8), title, font=get_font(14, bold=True), fill=(241, 245, 249, 255))
        draw.text((76, y_offset + 30), desc, font=get_font(11, bold=False), fill=(148, 163, 184, 255))
        y_offset += 64

    # Bottom tech pill row
    pills = ["Manifest V3", "GraphQL Inside", "Bilingual i18n", "Open Source"]
    px = 60
    for pill in pills:
        draw_rounded_rect(draw, (px, 510, px + 110, 536), radius=12, fill=(15, 23, 42, 200), outline=(71, 85, 105, 255), width=1)
        draw.text((px + 12, 515), pill, font=get_font(10, bold=True), fill=(203, 213, 225, 255))
        px += 122

    # Right Column: Sleek Dashboard UI Mockup Frame
    ui_x, ui_y, ui_w, ui_h = 630, 48, 720, 485
    # Card outer shadow frame
    draw_rounded_rect(draw, (ui_x, ui_y, ui_x + ui_w, ui_y + ui_h), radius=16, fill=(15, 23, 42, 230), outline=(56, 189, 248, 200), width=2)

    # Top window bar
    draw_rounded_rect(draw, (ui_x, ui_y, ui_x + ui_w, ui_y + 40), radius=16, fill=(30, 41, 59, 255))
    # Window buttons
    draw.ellipse([ui_x + 16, ui_y + 14, ui_x + 28, ui_y + 26], fill=(239, 68, 68, 255)) # red
    draw.ellipse([ui_x + 36, ui_y + 14, ui_x + 48, ui_y + 26], fill=(245, 158, 11, 255)) # yellow
    draw.ellipse([ui_x + 56, ui_y + 14, ui_x + 68, ui_y + 26], fill=(16, 185, 129, 255)) # green
    draw.text((ui_x + 84, ui_y + 12), "ONES 工时助手 Dashboard — ones.reachauto.com", font=get_font(12, bold=True), fill=(203, 213, 225, 255))

    # Step Wizard Bar
    step_y = ui_y + 52
    steps = ["1.获取数据", "2.规划工时", "3.预览分配", "4.提交工时", "5.状态流转", "6.完成"]
    step_w = (ui_w - 32) // 6
    for i, s in enumerate(steps):
        sx = ui_x + 16 + i * step_w
        is_active = (i == 2) # Step 3 highlighted
        bg_col = (14, 165, 233, 255) if is_active else (30, 41, 59, 200)
        text_col = (255, 255, 255, 255) if is_active else (148, 163, 184, 255)
        draw_rounded_rect(draw, (sx, step_y, sx + step_w - 6, step_y + 28), radius=6, fill=bg_col)
        draw.text((sx + 8, step_y + 6), s, font=get_font(11, bold=True), fill=text_col)

    # Info summary bar inside dashboard
    info_y = step_y + 40
    draw_rounded_rect(draw, (ui_x + 16, info_y, ui_x + ui_w - 16, info_y + 45), radius=8, fill=(30, 41, 59, 180), outline=(51, 65, 85, 255))
    draw.text((ui_x + 30, info_y + 12), "📅 目标月份: 2026-08  |  工作日: 22天  |  计划总工时: 176.0h  |  活跃任务: 5个", font=get_font(12, bold=True), fill=(56, 189, 248, 255))

    # Main dashboard content: Calendar + Task preview
    # Left sub-panel: Task List
    tx, ty, tw, th = ui_x + 16, info_y + 55, 330, 260
    draw_rounded_rect(draw, (tx, ty, tx + tw, ty + th), radius=8, fill=(15, 23, 42, 200), outline=(51, 65, 85, 255))
    draw.text((tx + 12, ty + 10), "📋 本月关联任务清单", font=get_font(12, bold=True), fill=(241, 245, 249, 255))

    tasks = [
        ("[FE-1024] 扩展框架重构与 V3 迁移", "24.0h / 剩余 24h", (16, 185, 129, 255)),
        ("[FE-1038] Edge 商店上架材料与图标", "16.0h / 剩余 16h", (14, 165, 233, 255)),
        ("[QA-882] 自动化测试与北森考勤校验", "16.0h / 剩余 16h", (245, 158, 11, 255)),
        ("[DOC-301] 双语说明书与隐私政策编写", "8.0h / 剩余 8h", (129, 140, 248, 255))
    ]

    t_item_y = ty + 34
    for task_name, task_h, color in tasks:
        draw_rounded_rect(draw, (tx + 8, t_item_y, tx + tw - 8, t_item_y + 48), radius=6, fill=(30, 41, 59, 180), outline=(51, 65, 85, 150))
        draw.text((tx + 16, t_item_y + 6), task_name, font=get_font(11, bold=True), fill=(241, 245, 249, 255))
        draw.text((tx + 16, t_item_y + 26), task_h, font=get_font(10, bold=False), fill=color)
        t_item_y += 54

    # Right sub-panel: Calendar Preview Grid
    cx, cy, cw, ch = ui_x + 360, info_y + 55, 344, 260
    draw_rounded_rect(draw, (cx, cy, cx + cw, cy + ch), radius=8, fill=(15, 23, 42, 200), outline=(51, 65, 85, 255))
    draw.text((cx + 12, cy + 10), "🗓️ 工时分配日历预览 (2026年8月)", font=get_font(12, bold=True), fill=(241, 245, 249, 255))

    # Calendar Grid (5x7)
    days_header = ["一", "二", "三", "四", "五", "六", "日"]
    grid_x = cx + 12
    grid_y = cy + 34
    cell_w, cell_h = 42, 36

    for i, d in enumerate(days_header):
        draw.text((grid_x + i * cell_w + 14, grid_y), d, font=get_font(11, bold=True), fill=(148, 163, 184, 255))

    grid_y += 20
    day_count = 1
    for row in range(5):
        for col in range(7):
            if day_count <= 31:
                is_weekend = (col >= 5)
                dx = grid_x + col * cell_w
                dy = grid_y + row * cell_h
                cell_bg = (30, 41, 59, 120) if is_weekend else (16, 185, 129, 40)
                border_col = (51, 65, 85, 150) if is_weekend else (16, 185, 129, 180)
                draw_rounded_rect(draw, (dx, dy, dx + cell_w - 4, dy + cell_h - 4), radius=4, fill=cell_bg, outline=border_col)
                
                txt_col = (100, 116, 139, 255) if is_weekend else (255, 255, 255, 255)
                draw.text((dx + 4, dy + 2), str(day_count), font=get_font(10, bold=True), fill=txt_col)
                if not is_weekend:
                    draw.text((dx + 18, dy + 18), "8h", font=get_font(9, bold=True), fill=(52, 211, 153, 255))
                day_count += 1

    # Bottom action bar in card
    bottom_y = ui_y + ui_h - 50
    draw_rounded_rect(draw, (ui_x + 16, bottom_y, ui_x + ui_w - 16, bottom_y + 38), radius=8, fill=(14, 165, 233, 255))
    draw.text((ui_x + ui_w // 2 - 90, bottom_y + 10), "🚀 一键确认分配并提交工时 ➔", font=get_font(13, bold=True), fill=(255, 255, 255, 255))

    out_path = os.path.join(STORE_DIR, "promo_large_1400x560.png")
    img.save(out_path)
    print(f"Generated: {out_path}")

def generate_screenshot1():
    width, height = 1280, 800
    img = Image.new("RGBA", (width, height), (15, 23, 42, 255)) # Dark navy background
    draw = ImageDraw.Draw(img)

    # Top Header Bar
    draw_rounded_rect(draw, (0, 0, width, 54), radius=0, fill=(30, 41, 59, 255))
    if os.path.exists(LOGO_PATH):
        logo = Image.open(LOGO_PATH).convert("RGBA")
        logo_resized = logo.resize((32, 32), Image.Resampling.LANCZOS)
        img.paste(logo_resized, (16, 11), logo_resized)

    draw.text((58, 14), "ONES 工时助手 — 独立工时规划与自动化流转面板", font=get_font(16, bold=True), fill=(255, 255, 255, 255))
    draw_rounded_rect(draw, (width - 160, 12, width - 16, 42), radius=15, fill=(16, 185, 129, 40), outline=(52, 211, 153, 255))
    draw.text((width - 146, 18), "● 登录状态: 已登录", font=get_font(11, bold=True), fill=(52, 211, 153, 255))

    # Step Wizard Pipeline
    step_y = 66
    steps = [
        ("1. 获取数据", True),
        ("2. 规划工时", True),
        ("3. 预览分配", True),
        ("4. 提交工时", False),
        ("5. 状态流转", False),
        ("6. 完成", False)
    ]
    sw = (width - 32) // 6
    for i, (name, completed) in enumerate(steps):
        sx = 16 + i * sw
        is_current = (i == 2)
        bg = (14, 165, 233, 255) if is_current else ((30, 41, 59, 255) if completed else (15, 23, 42, 255))
        outline_col = (56, 189, 248, 255) if is_current else (51, 65, 85, 255)
        draw_rounded_rect(draw, (sx, step_y, sx + sw - 8, step_y + 36), radius=8, fill=bg, outline=outline_col, width=1)
        t_col = (255, 255, 255, 255) if (is_current or completed) else (148, 163, 184, 255)
        draw.text((sx + 16, step_y + 9), name, font=get_font(12, bold=True), fill=t_col)

    # Info summary bar
    info_y = 114
    draw_rounded_rect(draw, (16, info_y, width - 16, info_y + 50), radius=8, fill=(30, 41, 59, 200), outline=(51, 65, 85, 255))
    draw.text((32, info_y + 14), "📊 目标月份: 2026-08  |  应填工作日: 22天  |  应填总工时: 176.0 小时  |  关联活跃任务: 5 个  |  考勤集成: 北森打卡已关联", font=get_font(13, bold=True), fill=(56, 189, 248, 255))

    # Main area splitting into 2 columns
    # Left Column: Task list & Allocation details (Width 610)
    lx, ly, lw, lh = 16, 176, 610, 550
    draw_rounded_rect(draw, (lx, ly, lx + lw, ly + lh), radius=10, fill=(30, 41, 59, 150), outline=(51, 65, 85, 255))
    draw.text((lx + 16, ly + 14), "📋 跨项目任务工时分配表", font=get_font(14, bold=True), fill=(241, 245, 249, 255))

    # Task Table Headers
    draw_rounded_rect(draw, (lx + 12, ly + 44, lx + lw - 12, ly + 76), radius=6, fill=(15, 23, 42, 200))
    draw.text((lx + 24, ly + 52), "任务名称 / Key", font=get_font(11, bold=True), fill=(148, 163, 184, 255))
    draw.text((lx + 320, ly + 52), "分配工时", font=get_font(11, bold=True), fill=(148, 163, 184, 255))
    draw.text((lx + 430, ly + 52), "流转目标状态", font=get_font(11, bold=True), fill=(148, 163, 184, 255))

    task_data = [
        ("[FE-1024] 扩展架构 Manifest V3 升级与重构", "40.0h", "进行中 ➔ 完成审核中", (16, 185, 129, 255)),
        ("[FE-1038] Edge 商店发布素材与全套图标绘制", "32.0h", "未开始 ➔ 进行中", (14, 165, 233, 255)),
        ("[QA-882] 自动化测试用例覆盖与 Cookie 校验", "40.0h", "进行中 ➔ 完成审核中", (16, 185, 129, 255)),
        ("[DOC-301] 补充隐私政策 PRIVACY.md 与商店元数据", "24.0h", "未开始 ➔ 进行中", (14, 165, 233, 255)),
        ("[BE-509] 北森考勤数据自动化解析接口对接", "40.0h", "完成审核中 ➔ 已完成", (129, 140, 248, 255)),
    ]

    item_y = ly + 86
    for tname, thours, tstatus, color in task_data:
        draw_rounded_rect(draw, (lx + 12, item_y, lx + lw - 12, item_y + 80), radius=8, fill=(15, 23, 42, 180), outline=(51, 65, 85, 180))
        draw.text((lx + 24, item_y + 12), tname, font=get_font(12, bold=True), fill=(241, 245, 249, 255))
        draw.text((lx + 24, item_y + 36), "所属项目: ONES 效能辅助工具集  |  负责人: duyin", font=get_font(10, bold=False), fill=(148, 163, 184, 255))
        
        draw_rounded_rect(draw, (lx + 320, item_y + 16, lx + 410, item_y + 42), radius=6, fill=(14, 165, 233, 30), outline=(56, 189, 248, 255))
        draw.text((lx + 334, item_y + 21), thours, font=get_font(12, bold=True), fill=(56, 189, 248, 255))

        draw_rounded_rect(draw, (lx + 430, item_y + 16, lx + lw - 24, item_y + 42), radius=6, fill=(30, 41, 59, 200), outline=color)
        draw.text((lx + 438, item_y + 21), tstatus, font=get_font(10, bold=True), fill=color)

        item_y += 88

    # Right Column: Calendar Grid Preview (Width 620)
    rx, ry, rw, rh = 642, 176, 622, 550
    draw_rounded_rect(draw, (rx, ry, rx + rw, ry + rh), radius=10, fill=(30, 41, 59, 150), outline=(51, 65, 85, 255))
    draw.text((rx + 16, ry + 14), "🗓️ 2026年8月 每日工时分布日历 (已打满 176.0h)", font=get_font(14, bold=True), fill=(241, 245, 249, 255))

    # Calendar Header
    days_h = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    cw = (rw - 32) // 7
    for i, dh in enumerate(days_h):
        draw.text((rx + 16 + i * cw + 18, ry + 46), dh, font=get_font(12, bold=True), fill=(148, 163, 184, 255))

    # Days grid
    grid_top = ry + 74
    day_num = 1
    for row in range(5):
        for col in range(7):
            if day_num <= 31:
                cell_x = rx + 16 + col * cw
                cell_y = grid_top + row * 86
                is_we = (col >= 5)
                
                c_bg = (15, 23, 42, 150) if is_we else (16, 185, 129, 30)
                c_border = (51, 65, 85, 150) if is_we else (16, 185, 129, 200)
                draw_rounded_rect(draw, (cell_x, cell_y, cell_x + cw - 6, cell_y + 80), radius=6, fill=c_bg, outline=c_border)
                
                num_col = (100, 116, 139, 255) if is_we else (241, 245, 249, 255)
                draw.text((cell_x + 8, cell_y + 6), str(day_num), font=get_font(11, bold=True), fill=num_col)

                if not is_we:
                    draw_rounded_rect(draw, (cell_x + 8, cell_y + 28, cell_x + cw - 14, cell_y + 50), radius=4, fill=(16, 185, 129, 200))
                    draw.text((cell_x + 14, cell_y + 32), "8.0h 已填", font=get_font(10, bold=True), fill=(255, 255, 255, 255))
                    draw.text((cell_x + 8, cell_y + 56), "Task: FE-1024", font=get_font(9, bold=False), fill=(148, 163, 184, 255))
                else:
                    draw.text((cell_x + 20, cell_y + 36), "休息日", font=get_font(10, bold=False), fill=(100, 116, 139, 255))
                
                day_num += 1

    # Bottom Action Bar
    draw_rounded_rect(draw, (0, height - 60, width, height), radius=0, fill=(30, 41, 59, 255))
    draw_rounded_rect(draw, (width - 240, height - 48, width - 24, height - 12), radius=8, fill=(14, 165, 233, 255))
    draw.text((width - 210, height - 36), "确认分配并进行下一步 ➔", font=get_font(13, bold=True), fill=(255, 255, 255, 255))
    draw.text((32, height - 36), "💡 提示: 提交过程将直接在浏览器本地与 ONES 官方 GraphQL 接口交互，绝不上传数据。", font=get_font(12, bold=False), fill=(148, 163, 184, 255))

    out_path = os.path.join(STORE_DIR, "screenshot1_1280x800.png")
    img.save(out_path)
    print(f"Generated: {out_path}")

if __name__ == "__main__":
    generate_promo_small()
    generate_promo_large()
    generate_screenshot1()
